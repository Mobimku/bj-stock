# HANDOFF.md — BJ Stock

Log serah-terima per fase. Ditulis oleh agent di akhir setiap fase (lihat `AGENTS.md` § 10 dan `TODO.md`).
Dibaca oleh: (1) manusia yang mau review cepat, (2) sesi agent baru yang lanjutin kerjaan.

Tulis to-the-point. Entri terbaru di paling atas.

---

## Status Saat Ini

- **Fase aktif**: Fase 9.19 DP Reservation — **deployed production, review visual/authenticated Owner pending**.
- **Production**: `https://bj-stock.vercel.app` (Vercel project `mobimku-1297s-projects/bj-stock`, deploy CLI).
- **Supabase**: project `BJsys Project` / ref `ksecrddwowrswfcbdknf` (ap-northeast-2). Migration remote sampai `202607260001_dp_reservation`.
- **Source backup**: private GitHub `https://github.com/Mobimku/bj-stock` (`master`). Secret (`.env*`, `.vercel/`) **tidak** di-commit.
- **Lokal**: workspace `D:\BJsys` (dipulihkan dari OpenCode snapshot + sesi tool history setelah folder hilang).
- **Interface yang bisa direview**: Reservasi (DP) tersedia di production. Owner akan menguji visual dan flow authenticated setelah deploy lalu memberi feedback.

---

## Fase 9.19 — DP Reservation — 26 Juli 2026 (production deployed, Owner QA pending)

**Apa yang dibangun**
1. **Migration SQL** (`202607260001_dp_reservation.sql`): tambah `Dipesan` ke `units.status`, `Uang Muka Reservasi` ke kategori Finance, `Reservasi` ke `source_module`, aksi reservasi ke `admin_actions_log`. Tabel `reservations` (uuid PK, idempotency_key unique, id_unit FK, id_customer FK, dp_amount, agreed_price, is_refundable, previous_status, status Dipesan/Selesai/Dibatalkan/Hangus, expires_at, completed_at/cancelled_at/forfeited_at, id_dp_transaction unique FK, id_invoice unique FK, created_by, timestamps). Partial unique index satu DP aktif per unit. Trigger `protect_reservation_terms` (immutable). Patch `enforce_unit_status_transition` dan `prepare_sale` untuk Dipesan via transactional flag.
2. **Empat RPC atomik** (`security definer`):
   - `create_reservation()`: Admin/Owner, idempotency via advisory lock + unique key, insert reservation + set unit Dipesan + finance Uang Muka Reservasi (Masuk) + admin_actions_log.
   - `complete_reservation()`: Admin/Owner, reverse DP + invoke `create_sale` di agreed_price penuh (F-SLS-02), Tunai/Transfer only, tolak overdue.
   - `refund_reservation()`: **Owner only**, cash-out reversal, unit kembali ke previous_status.
   - `forfeit_reservation()`: Admin/Owner, non-refundable only, **tanpa entri finance baru**, DP diakui P&L via `pendapatan_dp_hangus`.
3. **Patch `get_profit_loss`**: tambah `pendapatan_dp_hangus` dari `reservations WHERE status = 'Hangus'`.
4. **Zod validation** (`lib/validation/reservation.ts`): `createReservationSchema` (idempotencyKey uuid, unitId, customerId uuid, dpAmount positive < agreedPrice, isRefundable bool, expiresAt future ISO), `completeReservationSchema` (unitTest full F-SLS-02, paymentMethod Tunai/Transfer, channel, transactionDate, warrantyDays positive).
5. **Empat API routes**: `POST /api/reservations` (201), `POST /api/reservations/[id]/complete` (200 + idInvoice), `POST /api/reservations/[id]/refund` (Owner 403 gate), `POST /api/reservations/[id]/forfeit` (200). `POST /api/sales` dipatch dengan guard reject Dipesan di route level.
6. **UI Reservasi (`reservation-section.tsx`)**: client component di detail unit — untuk Dipesan tampilkan card info customer/DP/harga/expiry + aksi Lunasi/Refund/Hangus (sesuai role dan refundable flag), untuk Ready/Listed tampilkan form buat reservasi (customer select, DP input, harga prefill listing, refundable toggle, expiry picker). Expiry overdue warning merah.
7. **Halaman `/reservations`**: server component, list semua reservasi filter by status, desktop table + mobile cards.
8. **Navigation**: item "Reservasi" ditambahkan di `nav-items.ts` untuk admin/owner (sidebar desktop + drawer mobile, tidak di bottom tab).
9. **PGlite regression tests** (4 files): `reservation-create` (create + status + finance + idempotency + role gate), `reservation-complete` (Selesai + sale penuh + 3 finance net agreed_price + warranty + role gate), `reservation-resolve` (refund net 0 + gate admin + forfeit + P&L dp_hangus + gate teknisi), `reservation-guards` (expired + tetap terkunci + immutable terms + no premature warranty). Test harness `reservation-harness.mjs` + fixtures `reservation-fixtures.mjs`.

**Keputusan teknis**
- **Idempotency via advisory lock**: `pg_advisory_xact_lock(hashtext('reservation:' || key))` + unique constraint. Replay data sama → return existing row. Replay data berbeda → exception. Lihat `TODO.md` catatan 2026-07-26.
- **Completion = reversal DP + `create_sale` full**: bukan jurnal sisa. Warranty trigger membaca `harga_jual = agreed_price` penuh, revenue report penuh dari `sales`, DP reversal memberi audit trail eksplisit. Net finance = agreed_price penuh.
- **Forfeit tanpa entri finance baru**: DP sudah cash-in saat create. Forfeit hanya pengakuan pendapatan via P&L query `reservations.dp_amount WHERE status = 'Hangus'`. Hindari double-counting cash flow.
- **Overdue tidak auto-resolve**: expiry hanya blokir completion. Refund/forfeit tetap tersedia. Keputusan sadar — auto-Hangus akan menghilangkan hak customer tanpa proses manual Owner.
- **Unit `Dipesan` hanya lewat completion**: `POST /api/sales` menolak Dipesan di route level + `prepare_sale` RPC hanya accept Dipesan saat `app.reservation_flow` aktif (transactional flag dari `complete_reservation`).

**Verifikasi dan deployment**
- **Lokal/PGlite**: seluruh 4 test reservation lulus (48 + 43 + 53 + 39 assertions). Bukti:
  - Create: unit `UNIT-RSV-01` → Dipesan, DP 500.000 Masuk ke Kas Toko, idempotency replay aman, create_sale langsung ditolak, teknisi 403.
  - Complete: Selesai, sale 3.500.000, 3 finance entries net 3.500.000, warranty 26 Jul → 9 Sep (45 hari), Cicilan ditolak, teknisi ditolak.
  - Resolve: refund Owner → Dibatalkan + unit Listed + net 0; admin cannot refund; forfeit Admin → Hangus + no finance entry + P&L dp_hangus 500.000; teknisi cannot forfeit.
  - Guards: expired completion ditolak + reservasi tetap Dipesan + unit tetap terkunci; 4 kolom immutable ditolak; belum ada warranty (belum complete).
- **Regression/type/build**: `npm run test:reservation`, focused `sale-unit-test.test.mjs`, `npx tsc --noEmit --incremental false`, dan `npm run build` lulus. Full `npm run test:db` tetap berhenti pada kegagalan pre-existing `initial-migration.test.mjs` sebelum suite lain berjalan.
- **Supabase production**: dry-run menawarkan tepat `202607260001_dp_reservation.sql`; setelah push, remote latest migration `202607260001` dan REST schema probe tabel `reservations` mengembalikan HTTP 200. Warning cache katalog lokal hanya karena Docker Desktop tidak aktif dan tidak memengaruhi push remote.
- **Vercel production**: deployment `https://bj-stock-jdievwwlm-mobimku-1297s-projects.vercel.app` berstatus READY; alias `https://bj-stock.vercel.app` aktif.
- **HTTP smoke tanpa sesi**: `/login` 200, `/katalog` 200, `/reservations` 307 ke `/login`, root 307 ke `/dashboard`.
- **Visual/authenticated QA**: Playwright sengaja tidak dijalankan atas instruksi Owner. Flow create/complete/refund/forfeit dan viewport 360px/390px/desktop menunggu review Owner setelah deploy; ini bukan blocker deployment.
- **Blokir lint**: ESLint 10 / `eslint-plugin-react` incompatibility pre-existing (sejak Fase 9.2). Bukan temuan baru.

**Status interface**
- [x] Backend (migration + RPCs + API + Zod) — production
- [x] Frontend (reservation-section, `/reservations`, nav item) — production
- [x] Migration deployed ke Supabase production
- [x] Vercel production build + deploy
- [ ] Authenticated browser/visual QA — menunggu review dan feedback Owner

**Yang belum selesai / diketahui rusak**
- Tidak ada blocker deployment yang diketahui. Review visual dan flow authenticated belum dilakukan sesuai instruksi Owner.
- Pre-existing `initial-migration.test.mjs` gagal sejak awal (bukan regresi reservasi).
- ESLint incompatibility pre-existing (ESLint 10 / `eslint-plugin-react`).

**Rekomendasi mulai fase berikutnya dari mana**
1. Owner login sebagai Admin/Owner dan jalankan flow create reservasi → cek unit `Dipesan` + Finance → complete (F-SLS-02) → cek sale, warranty, dan net Finance.
2. Uji refund refundable sebagai Owner, forfeit non-refundable sebagai Admin/Owner, overdue guard, role Teknisi, serta viewport 360px/390px/desktop.
3. Catat feedback visual/operasional; centang QA Fase 9.19 setelah flow production disetujui Owner.

**Apa yang dibangun**
- `catalog_events.traffic_source` menyimpan label pendek terklasifikasi. UTM diprioritaskan, lalu alias share/referrer hostname, lalu `direct`; source pertama disimpan per tab di `sessionStorage`.
- Empat event katalog membawa `trafficSource`. Event internal tetap ditandai dari JWT dan dikecualikan dari statistik publik.
- RPC analytics mengembalikan `top_sources` berisi visitor unik, detail view, dan klik WhatsApp. Reports menampilkan tabel sumber 30 hari dan ekspor CSV `catalog-top-sources`.

**Keputusan teknis**
- Privacy-first: tidak menyimpan raw URL/referrer, IP, user agent, lokasi, atau fingerprint; label divalidasi regex dan dibatasi 48 karakter.
- RPC `record_catalog_event(text, uuid, text)` yang sudah live dipertahankan. Overload baru `(text, uuid, text, text)` mewajibkan tepat empat argumen sehingga PostgREST dapat merutekan kedua versi tanpa ambigu selama cutover.
- Vercel CLI membaca token dari `VERCEL_TOKEN`; credential lokal bernama `VERCEL_ACCESS_TOKEN`, jadi deployment memetakan nilainya di process memory dan membuang surrounding quotes tanpa mencatat nilainya.

**Verifikasi dan deployment**
- Focused `catalog-analytics.test.mjs`: 1/1 lulus. `tsc --noEmit --incremental false`, build lokal Next, dan build Vercel lulus.
- Standalone lint tetap terblokir incompatibility existing ESLint 10/`eslint-plugin-react`; crash terjadi sebelum source dibaca.
- Supabase local/remote sinkron sampai `202607230001`; kompatibilitas aplikasi lama setelah migration dibuktikan `POST /api/catalog/events` HTTP 204.
- Commit feature `3547ccd` sudah di-push ke private GitHub `master`.
- Deployment Ready Production: `https://bj-stock-3bzjcjgvh-mobimku-1297s-projects.vercel.app`, aliased ke `https://bj-stock.vercel.app`.
- Playwright fresh context mengirim `catalog_view` dan `detail_view` dengan `trafficSource: "utm:instagram-story-release3547final"`, source/session yang sama, kedua response HTTP 204, dan tanpa console error.

**Status interface**
- [x] Backend, katalog tracker, Reports, dan CSV deployed production.
- [ ] Owner/Admin dapat review tabel sumber dan CSV setelah trafik nyata terakumulasi; event historis tanpa source tampil sebagai **Tidak diketahui**.

**Yang belum selesai / diketahui rusak**
- Tidak ada blocker produk yang diketahui. Standalone lint masih memiliki incompatibility toolchain existing.

**Rekomendasi mulai fase berikutnya dari mana**
- Review `/reports` setelah beberapa link UTM dipakai; jangan menambah raw referrer atau identitas pengunjung hanya untuk memperkaya label channel.

---

## Hotfix / Patch pasca-restore — 20–23 Juli 2026

**Konteks**: folder lokal `D:\BJsys` hilang; dipulihkan dari OpenCode snapshot + DB/env production; lanjut hotfix operasional Owner.

### Restore & infrastruktur
- Restore source dari OpenCode git snapshot project hash `9c0059…` (+ backfill file hilang dari tool `read`/`write` di sesi).
- `.env.local` diisi dari Vercel production env + catatan Owner; `vercel link` ke `bj-stock`.
- Supabase CLI: `supabase login` + `link` project-ref `ksecrddwowrswfcbdknf`; migration push remote.
- First git commit + private repo GitHub `Mobimku/bj-stock` (push `master`).

### Database (production applied)
| Migration | Isi |
|-----------|-----|
| `202607200001_fix_resale_constraint.sql` | Hapus UNIQUE unconditional `sales.id_unit`; partial unique index hanya sale `status != 'Dibatalkan'` → unit bisa dijual ulang setelah cancel. |
| `202607200002_fix_bank_stock_price_update.sql` | `update_bank_part`: jika `modal_per_unit` berubah, catat koreksi finance untuk stok existing (bukan hanya saat restock). |
| `202607200003_fill_bank_stock_price_gap.sql` | One-time fill gap historis: `expected = SUM(restock.qty)×modal_saat_ini` vs finance net; insert 1 txn koreksi per part (idempotent `part-price-gap-fill:v1:{id_part}`). Mouse: +149.850 → total finance 150.000. |

### Aplikasi (deploy Vercel production)
- **Akun**: create user admin/teknisi tanpa SMTP — password sementara di-generate server, dikembalikan di response UI (bukan email invite).
- **WA**: normalisasi dulu (strip `+`/spasi/dash, `0…`/`8…` → `62…`) baru validasi; `onBlur` di form sales/service/customer/settings.
- **iOS zoom input**: `input/select/textarea { font-size: 16px }` global + `text-base` pada field form.
- **Edit unit**: Admin **dan** Owner boleh edit **brand** + **model** + spek/kondisi; **`id_unit` tidak berubah**; audit `edit_unit_identity` bila brand/model berubah.
- **Modal edit unit**: lock scroll `body` + `.dashboard-content`; hanya panel form yang scroll (`overscroll-contain`).
- **Print invoice**: `@page size A4 landscape; margin 5mm`; proporsi invoice ~165mm / checklist ~116mm; font & spacing dipadatkan agar 1 lembar.
- **Sidebar desktop**: header + footer sticky; hanya nav list yang `overflow-y-auto`.

### Keputusan
- Backup source ke GitHub private; deploy tetap CLI Vercel (belum wajib git-integration).
- Koreksi harga Bank Stock historis pakai **fill gap** (1 baris koreksi), bukan rewrite restock lama — audit trail utuh, anti-double via unique `source_event_key`.
- Brand/model editable untuk koreksi typo; serial/modal_awal/sumber/tanggal/spek_awal tetap immutable.

### Cara verifikasi cepat
- Sales: cancel → Ready → Listed → jual ulang unit yang sama.
- Bank Stock: ubah modal/unit tanpa restock → finance ada baris koreksi; total net = qty_restock × modal_saat_ini.
- Edit unit: ubah brand/model → header unit berubah, ID tetap; scroll modal tidak menggeser background.
- Print: invoice + checklist test landscape 1 halaman.
- GitHub: repo private, tanpa file `.env.local`.

**Status interface**: production deployed; Owner lanjut operasi harian.

---

## Fase 9.17 — Optimasi Foto Unit Responsif — 18 Juli 2026

**Apa yang dibangun**
- Menghapus `unoptimized` dari Card/Daftar `/units`, galeri internal, list/detail katalog, thumbnail, dan kedua lightbox. Semua foto rendered sekarang memakai optimizer bawaan Next/Vercel.
- `sizes` mengikuti footprint nyata: Card 341px dan List 72px pada viewport 390px; galeri internal 166px; card katalog 160px; detail katalog 375px. Breakpoint desktop mengikuti grid existing.
- `next.config.ts` mempertahankan allowlist sempit ke host Supabase dan path `/storage/v1/object/public/unit-photos/**` memakai bentuk `new URL(...)` resmi Next 16. Upload, storage, schema, data, layout, dan URL OpenGraph tidak berubah.

**Keputusan teknis**
- Supabase Image Transformation tidak diperlukan. Next/Vercel mengambil file publik asli sekali, menghasilkan ukuran responsif, dan menyajikannya lewat `/_next/image` dengan cache.
- Keputusan historis Fase 7.7 untuk memakai `unoptimized` disupersede: Supabase Free tidak menyediakan transformasi sendiri, tetapi itu tidak menghalangi optimizer server Next/Vercel.

**Verifikasi dan deployment**
- RED `supabase/tests/unit-photo-optimization.test.mjs` gagal pada flag `unoptimized`, lalu lulus setelah seluruh surface dan allowlist memenuhi contract.
- `npm run test:db`, strict suppression audit, `npx tsc --noEmit --incremental false`, webpack production build, Vercel Turbopack production build, dan `git diff --check` lulus.
- Production optimizer probe mengembalikan HTTP 200 `image/png`: 68.585 byte pada `w=384`, dibanding file asli 3.071.799 byte (sekitar 97,8% lebih kecil); cache `max-age=14400` aktif.
- Microsoft Edge 390px membuktikan Card, Daftar, galeri internal, list/detail katalog, thumbnail, serta kedua lightbox memiliki `/_next/image`, responsive `srcset`/`sizes`, dialog buka-tutup benar, dan horizontal overflow 0.
- Local `next start` tidak dapat decode upstream pada mesin ini karena DNS NAT64 lokal mengembalikan `64:ff9b::/96` dan guard SSRF Next menolaknya; konfigurasi keamanan tidak dilonggarkan. Runtime Vercel production berhasil.
- Deployment Ready Production: `https://bj-stock-42bejwuec-mobimku-1297s-projects.vercel.app`, aliased ke `https://bj-stock.vercel.app`.

**Status interface**
- [x] Frontend production deployed dan dapat direview.
- [ ] Owner dapat membandingkan ketajaman serta kecepatan foto pada HP asli; tidak ada perubahan layout atau alur interaksi.

**Yang belum selesai / diketahui rusak**
- Tidak ada blocker produk yang diketahui. Standalone ESLint tetap memiliki incompatibility toolchain existing ESLint 10/`eslint-plugin-react`.

**Rekomendasi mulai fase berikutnya dari mana**
- Review cepat foto Card/Daftar dan detail katalog di jaringan seluler; lanjutkan task berikutnya tanpa menambah thumbnail table atau dependency image baru kecuali metrik production membuktikan perlu.

---

## Fase 9.16 — Daftar Unit: Foto, Kartu/Daftar & Sort — 16 Juli 2026

**Apa yang dibangun**
- `/units` tetap server-rendered dan sekarang mengambil foto pertama, Harga Listing, Total Modal, tanggal masuk, serta tie-break timestamp/ID.
- Mode **Kartu** tetap default. Mode **Daftar** menyediakan row operasional ringkas dengan thumbnail 72×54px di mobile dan 96×72px mulai breakpoint `sm`.
- Foto memakai frame 4:3, `next/image`, `object-cover`, alt unit bermakna, dan fallback **Foto belum tersedia** tanpa layout shift.
- Toolbar hasil menampilkan jumlah unit, native select Urutkan, dan switch Kartu/Daftar. Filter, sort, dan view saling mempertahankan `brand`, `status`, `sort`, serta `view` lewat query URL; Reset kembali ke `/units`.
- Harga Listing menjadi nominal utama. Total Modal tetap terlihat sebagai biaya internal; harga listing null tampil **Belum diatur**.

**Keputusan teknis**
- Termurah/Termahal mengurutkan `harga_listing`; null selalu terakhir untuk arah naik maupun turun.
- Terbaru/Terlama memakai `tanggal_masuk`, lalu `created_at`, lalu `id_unit`. A-Z memakai `brand`, `model`, lalu `id_unit`.
- Tidak ada client component, localStorage, dependency, API, migration, perubahan role/status, atau kalkulasi uang baru.
- `DESIGN.md` dibuat dari pola UI existing dan `BRAND_GUIDE.md`; label uang dinaikkan ke kontras `stone-600`, semua control minimal 44px, judul unit membungkus alami, dan interaction memiliki hover/focus/pressed state.

**Verifikasi dan deployment**
- RED contract awal gagal karena `/units` belum memilih `harga_listing`; setelah implementasi `supabase/tests/unit-listing-presentation.test.mjs` lulus.
- `npm run test:db`, strict TypeScript audit, `npx tsc --noEmit --incremental false`, `next build --webpack`, dan Vercel Turbopack production build lulus. Standalone ESLint tetap terblokir incompatibility existing ESLint 10/`eslint-plugin-react` sebelum membaca source.
- Microsoft Edge clean tanpa Google Chrome: Kartu/Daftar pada 360×800, 390×844, dan 1280×800 semuanya `overflow=0`; foto Card 4:3, thumbnail List 72×54/96×72, focus ring 2px, target 44px, dan row terakhir 33px di atas bottom nav.
- Dua Oracle final memberi verdict PASS tanpa blocker setelah judul Card/List tidak lagi dipotong dan kontras label uang memenuhi contract.
- Deployment Ready Production: `https://bj-stock-3p7puq1au-mobimku-1297s-projects.vercel.app`, aliased ke `https://bj-stock.vercel.app`.
- Authenticated production smoke: default, Terlama, Termurah, Termahal, dan A-Z seluruhnya 200; Kartu/Daftar aktif benar; harga naik/turun terurut; filter/view URL terjaga; `/katalog` tetap 200; tidak ada console error. Sesi review kemudian logout kembali ke `/login`.

**Status interface**
- [x] Frontend production deployed dan dapat direview.
- [ ] Owner dapat membandingkan Kartu/Daftar di HP asli, mencoba lima urutan, dan memastikan kepadatan informasi sesuai workflow harian.

**Yang belum selesai / diketahui rusak**
- Tidak ada blocker produk yang diketahui untuk Fase 9.16.
- Standalone ESLint masih memiliki incompatibility toolchain existing yang juga tercatat pada fase sebelumnya; typecheck, strict audit, test, dan build tetap lulus.

**Rekomendasi mulai fase berikutnya dari mana**
- Review cepat `/units` pada HP asli. Bila kepadatan Daftar sudah sesuai, lanjutkan task berikutnya dari `TODO.md` tanpa mengubah kontrak sorting atau perhitungan uang.

---

## Fase 9.15 — Hotfix Settings `replacement_grace_days` — 16 Juli 2026

**Root cause dan fix**
- Tabel production memiliki enam key, tetapi API route dan form masing-masing menyimpan daftar lokal berisi lima key. Form mengirim seluruh row, lalu API menolak `replacement_grace_days` sebelum database dipanggil.
- `lib/app-settings.ts` sekarang menjadi satu metadata source berisi key, label, dan jenis field. API memperoleh whitelist/numeric keys dari modul ini; form memperoleh label/numeric keys dari modul yang sama.
- `replacement_grace_days` tampil sebagai field angka positif **Masa Minimum Garansi Pengganti (hari)**. Tidak ada perubahan schema, migration, nilai setting, atau RLS.

**Verifikasi dan deployment**
- RED test mereproduksi shared contract yang hilang, lima allowed keys, dan tiga numeric keys; setelah fix seluruh 21 contract check lulus.
- `npm run test:db`, strict TypeScript audit, `npx tsc --noEmit --incremental false`, local production build, dan Vercel production build lulus.
- Deployment Ready Production: `bj-stock-qrvfo4r12-mobimku-1297s-projects.vercel.app`, aliased ke `https://bj-stock.vercel.app`.
- Authenticated production smoke tanpa Chrome: GET 200 → PATCH unchanged enam key 200 → GET 200; tepat enam key termasuk `replacement_grace_days`, dan seluruh nilai sebelum/sesudah identik. Sesi Owner temporary kemudian direvoke.

**Status interface**
- [x] Backend dan frontend production deployed.
- [ ] Owner dapat review form `/settings/app-settings` langsung di HP/desktop; perubahan kode hanya menambah field setting yang sebelumnya sudah ada di database tetapi tidak dapat disimpan bersama field lain.

---

## Fase 9.14 — Share Analytics, Mobile Reports & Spreadsheet CSV — 16 Juli 2026

**Apa yang dibangun**
- Event `share_click` ditambahkan ke `catalog_events` sebagai jenis keempat: dicatat saat tombol Bagikan ditekan sebelum native share/clipboard dicoba. Pembatalan atau kegagalan tetap dihitung sebagai klik; event ini bukan bukti link terkirim.
- Laporan katalog Admin/Owner diperluas: metrik Klik Bagikan, dan konversi WhatsApp tetap sebagai `whatsapp_click / detail_view` tanpa digabung. Privasi, deduplikasi harian, dan pengecualian trafik internal tidak berubah.
- Halaman `/reports` diubah menjadi kartu di mobile (`< md`) dan tabel penuh di desktop (`>= md`) agar data terbaca di HP tanpa horizontal scroll.
- `GET /api/reports/export` menyediakan lima dataset CSV: `margin`, `turnover`, `leads`, `catalog-summary` (agregat), dan `catalog-top-units`. Parameter `start`/`end` untuk dataset non-katalog atau `days=7|30` untuk `catalog-*`; Admin/Owner saja. Output UTF-8 BOM dengan formula protection (apostrof `'` di awal sel teks berbahaya).
- Migration `202607160002_fase9_14_report_exports.sql`: tambah `share_click` ke CHECK constraint `catalog_events`, replace `record_catalog_event()` dan `get_catalog_analytics()`; tidak membuat RPC export — route memanggil RPC agregat existing.

**Verifikasi dan deployment**
- `npm run test:db` lulus seluruh suite.
- `npx tsc --noEmit` lulus.
- `next build --webpack` dan Vercel Turbopack build lulus.
- Supabase local/remote sinkron sampai `202607160002`.
- Vercel production aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-hd6kv4kdb-mobimku-1297s-projects.vercel.app`).
- Production HTTP/RPC smoke (tanpa Chrome): `/reports` 200 dengan cookie Admin, metrik katalog dan link export tampil; `GET /api/reports/export?dataset=catalog-summary&days=7` mengembalikan 200 `text/csv; charset=utf-8` dengan BOM; margin `start>end` mengembalikan 400; tanpa sesi 401; Teknisi 403.
- Sesi magic-link temporary dipakai untuk smoke, kemudian direvoke.

**Status interface**
- [x] Backend dan frontend production deployed.
- [ ] Tampilan kartu Reports di mobile dan tabel di desktop perlu review Owner pada viewport 360px/390px dan desktop. Chrome/Chromium visual QA tidak digunakan sesuai instruksi Owner.

---

## Fase 9.13 — Katalog Harga, Share & Lokasi — 16 Juli 2026

**Apa yang dibangun**
- Tagline menjadi **Katalog lengkap dan update.** Grade/filter Grade dihapus dari list, detail, dan RPC publik; `units.kondisi_fisik` internal tidak berubah.
- Chip filter harga selalu terlihat dengan empat band. Bottom sheet hanya memuat Termurah, Termahal, Terbaru, dan Terlama; filter/sort dipertahankan lewat query URL.
- Migration `202607160001_catalog_presentation_settings.sql` menambah `updated_at` untuk sort deterministik dan setting `store_google_maps_url`.
- Detail unit memiliki Bagikan (Web Share API + clipboard fallback) dan Lokasi. Mobile action row berada di atas WhatsApp; desktop lebar memakai rail floating kanan.
- Owner dapat mengisi URL Maps HTTPS di `/settings/app-settings`; Admin tetap read-only. Setting kosong menghasilkan action disabled, bukan link mati.

**Verifikasi dan deployment**
- Test baru `catalog-presentation.test.mjs` memverifikasi RPC tidak mengekspos Grade, data Grade internal tetap ada, setting Maps tersedia, dan source contract filter/sort/share lengkap.
- `npm run test:db`, `npx tsc --noEmit`, `next build --webpack`, Vercel Turbopack build, dan `git diff --check` lulus.
- Supabase local/remote sinkron sampai `202607160001`.
- Vercel production aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-4ul2xxrls-mobimku-1297s-projects.vercel.app`).
- HTTP/RPC smoke: tagline + empat filter + empat sort tampil, seluruh query route 200, list/detail tidak memuat GRADE, action Share/Lokasi ter-render, RPC memuat `updated_at` tanpa `kondisi_fisik`.

**Status interface**
- [x] Backend dan frontend production deployed.
- [ ] Owner isi URL Maps lalu review native share/clipboard dan posisi action pada HP/desktop asli. Chrome/Chromium tidak digunakan sesuai instruksi Owner.

---

## Fase 9.12 — Hotfix Katalog Desktop Scroll & Compact UI — 16 Juli 2026

**Root cause dan fix**
- `app/globals.css` mengunci `body` dengan `overflow:hidden` untuk semua route desktop. Dashboard memiliki `.dashboard-content` sebagai internal scroller, tetapi katalog publik tidak, sehingga wheel/touchpad tidak dapat menggulir halaman.
- Lock sekarang scoped ke `body:has(.dashboard-shell)`. Dashboard tetap memakai internal scroll; katalog dan route publik memakai document scroll.
- Grid katalog dibatasi `max-w-6xl` dan menjadi 2 kolom mobile, 3 kolom small/tablet, 4 kolom desktop, serta 5 kolom wide desktop. Sebelumnya tetap 2 kolom sehingga card pertama terukur sekitar 694px pada viewport 1440px.
- Header/filter dipadatkan pada desktop. Detail unit memakai container `max-w-5xl` dua kolom untuk galeri dan informasi, bukan satu kolom selebar layar.

**Verifikasi dan deployment**
- `npx tsc --noEmit` lulus. Build lokal Turbopack sempat crash pada CLI, lalu `next build --webpack` lulus; Vercel Turbopack build juga lulus.
- `git diff --check` bersih selain warning line-ending existing.
- Vercel production aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-gnv9p7rev-mobimku-1297s-projects.vercel.app`).
- HTTP smoke tanpa browser: `/katalog` 200, class 5-kolom/max-width ada, detail dua kolom ada, stylesheet memuat `body:has(.dashboard-shell)` dan tidak memuat global desktop body lock, `/dashboard` tanpa sesi tetap redirect.

**Status interface**
- [x] Production deployed.
- [ ] Owner cek langsung scroll wheel/touchpad dan kepadatan card desktop. Mobile tetap dua kolom berdasarkan responsive contract; Chrome/Chromium automation dihentikan sesuai instruksi Owner.

---

## Fase 9.11 — Upgrade Log: Downgrade Spek Manual — 15 Juli 2026

**Apa yang dibangun**
- Upgrade Log memiliki discriminator eksplisit `part`/`service`/`downgrade`; nominal tetap positif dan hanya `downgrade` yang dikurangkan dari `total_modal`.
- RPC `add_unit_downgrade()` mengunci unit lalu atomik menyimpan log dan memperbarui `spek_saat_ini`. Hanya Admin/Owner/Teknisi dan status `Masuk`/`QC`/`Ready`/`Listed`; modal hasil wajib >0.
- Form detail unit memiliki mode **Downgrade spek (kurangi modal)** dengan nominal, spek setelah, tanggal, dan catatan. History menampilkan label downgrade, spek setelah, dan nominal merah bertanda minus.
- Tidak ada mutasi Bank Stock atau jurnal Finance. Part copotan dicatat manual secara terpisah bila diperlukan.

**Keputusan teknis dan keamanan**
- Migration `202607150005_manual_spec_downgrade.sql` menambah schema, backfill, signed aggregation, service-only Finance trigger, RPC, serta RLS yang membuat downgrade immutable dari client.
- Migration `202607150006_manual_spec_downgrade_auth_fix.sql` memperbaiki guard menjadi null-safe setelah cloud smoke menemukan `NULL NOT IN (...)` tidak menolak JWT tanpa role.
- Direct insert downgrade ditolak oleh transaction flag `app.downgrade_flow`; UPDATE/DELETE client tidak melihat baris downgrade lewat policy manage. RPC security-definer delist tetap dapat membersihkan log saat `salah_input`.

**Verifikasi**
- RED→GREEN: RPC belum ada; bypass insert awalnya lolos; delete client awalnya berhasil; JWT tanpa role awalnya lolos. Keempat kontrak kemudian lulus setelah migration/hardening.
- Bukti hitung: unit modal 3.000.000 dikurangi downgrade 200.000 menjadi 2.800.000; `spek_saat_ini = Core i5, RAM 4 GB`; stok RAM tetap 4; jumlah jurnal Finance `UpgradeLog` tidak berubah; downgrade 3.000.000 ditolak dan rollback.
- `npm run test:db`, `npx tsc --noEmit`, `npm run build`, dan `git diff --check` lulus. Standalone ESLint masih terblokir incompatibility repo ESLint 10/`eslint-plugin-react` existing.
- Supabase local/remote sinkron sampai `202607150006`. Vercel aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-q8t9ulfuq-mobimku-1297s-projects.vercel.app`).
- Production smoke Teknisi: halaman unit 200 dan opsi UI terlihat; payload nol 400; tanpa sesi 401; unit final 400 tanpa perubahan modal/spek; sesi review direvoke.

**Status interface dan rekomendasi**
- [x] Backend dan frontend production deployed.
- [ ] Owner review happy path memakai unit dummy stok aktif pada viewport 360px/390px dan desktop. Aksi downgrade immutable, jadi pastikan nominal/spek benar sebelum menyimpan.
- Tidak ada blocker kode/deployment yang diketahui. Lima review agent otomatis tidak dapat mulai karena konfigurasi model provider invalid; direct self-review menemukan dan memperbaiki RLS delete, stale form, serta null-role guard sebelum release.

---

## Fase 9.10 — Upgrade Log: Lepas Part / Downgrade — 15 Juli 2026

**Apa yang dibangun**
- `DELETE /api/units/[id]/upgrade` menerima `logId` UUID dan hanya menghapus log part milik unit pada URL (`id_part IS NOT NULL`). Admin, Owner, dan Teknisi mengikuti akses CRUD Upgrade Log existing.
- Tombol **Lepas part** tampil per Upgrade Log part dengan konfirmasi, pending/error state, dan refresh halaman. Log jasa tanpa part tidak menampilkan tombol.
- Trigger database existing mengembalikan satu stok Bank Stock dan menghitung ulang `total_modal` secara atomik; tidak ada migration atau perhitungan uang baru di frontend.

**Verifikasi dan cara uji**
- `npm run test:db` lulus seluruh suite. Bukti F-UPG-02: stok part `3 → 4`; setelah jasa 150.000 dan part 250.000 dilepas, modal `3.150.000 → 2.750.000` (`modal_awal 2.750.000 + SUM(upgrade tersisa 0)`).
- `npx tsc --noEmit`, `npm run build`, dan `git diff --check` lulus. Standalone ESLint tetap terblokir incompatibility repo ESLint 10/`eslint-plugin-react` sebelum rule membaca source; ini issue tooling existing, bukan temuan pada file F-UPG-02.
- Vercel production build lulus dan aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-k7hd8cpvv-mobimku-1297s-projects.vercel.app`). Authenticated smoke: detail unit 200, log acak 404, request tanpa sesi 401; sesi review sementara direvoke.
- Buka `/units/[id]`, lepas satu part, lalu cek Upgrade Log, Total Modal, dan qty pada `/bank-stock`. Untuk mengganti dengan part lebih rendah, pasang part pengganti lewat form **Tambah upgrade** setelah part lama dilepas.

**Status interface dan catatan**
- [x] Interface tersedia di production untuk review Owner pada desktop dan viewport 360px/390px.
- Log jasa eksternal sengaja tidak dapat dihapus lewat aksi ini karena koreksinya melibatkan jurnal Finance.
- Production belum memiliki Upgrade Log part/jasa sebagai fixture, sehingga smoke test tidak membuat atau menghapus transaksi nyata. Tambahkan satu part lewat UI sebelum review tombol.
- Tidak ada blocker atau kerusakan yang diketahui.

---

## Fase 9.9 — Hotfix Session Refresh Semua Role — 15 Juli 2026

**Root cause dan fix**
- `lib/supabase/server.ts` memakai `setAll: () => {}`, sehingga token hasil refresh dari API/Server Action dibuang.
- Proxy penulis cookie hanya mencakup route operasional lama dan melewatkan dashboard, finance, reports, settings, export, serta help.
- `setAll` sekarang menulis lewat cookie store ketika diizinkan dan aman fallback pada Server Component. Matcher proxy mencakup seluruh halaman authenticated; API tetap memakai auth/error JSON miliknya sendiri.

**Verifikasi dan deployment**
- Typecheck dan production build lulus.
- Vercel production aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-do2uxw0dv-mobimku-1297s-projects.vercel.app`).
- Cookie sesi sengaja diberi `expires_at` masa lalu dengan refresh token valid: Owner `/dashboard` 200 + Set-Cookie, Teknisi `/units` 200 + Set-Cookie, Admin API terautentikasi + Set-Cookie. Tidak ada redirect login/401.

---

## Fase 9.8 — Hotfix Mobile Dynamic Viewport Scroll — 15 Juli 2026

**Root cause dan fix**
- Global `body overflow:hidden` mengunci mobile, sementara `.dashboard-content` menjadi nested scroller. Perubahan visual viewport saat browser bar HP hide/show membuat gesture scroll dapat berhenti.
- Mobile sekarang memakai document scroll alami: shell `min-h-dvh`, header sticky, body hanya `overflow-x:hidden`, dan content `overflow-y:visible`. Lock body + internal content scroll hanya aktif mulai `md` untuk mempertahankan sidebar desktop.
- Bottom nav tetap fixed, tetapi shell mereservasi `4rem + env(safe-area-inset-bottom)` sehingga elemen akhir dapat digulir di atas nav.

**Verifikasi dan deployment**
- Typecheck dan production build lulus.
- Vercel production aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-nxklkulxl-mobimku-1297s-projects.vercel.app`).
- Edge CDP authenticated pada lebar 390px, viewport diubah 844→700: body `auto`, document scrollable (`scrollTop 1630`), content `visible`/tanpa nested scroll, elemen terakhir 32px di atas nav, overlap 0.

---

## Fase 9.7 — Hotfix Print Orientation & Formatting — 15 Juli 2026

**Root cause dan fix**
- `@page size: A4 landscape` memaksa seluruh dokumen ke Landscape, sehingga perubahan orientasi di browser tidak berdampak.
- `size` global dihapus; margin tetap 8 mm. Invoice memakai orientation query berbeda: Landscape `281 × 194mm` dengan kolom `174 + 103mm`, Portrait `194 × 281mm` dengan kolom `114 + 76mm`.
- Panel test Portrait memakai tinggi halaman penuh dan row/font yang disesuaikan. Bukti penggantian serta nota non-invoice mengikuti ukuran halaman browser tanpa orientasi paksa.

**Verifikasi dan deployment**
- Typecheck dan production build lulus.
- Vercel production aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-9l0anma4p-mobimku-1297s-projects.vercel.app`).
- Stylesheet production terverifikasi memiliki query `orientation: landscape` dan `orientation: portrait`, serta tidak memiliki `size: A4 landscape`.
- Preview printer/PDF visual tetap direview Owner karena hasil akhir bergantung browser dan driver printer.

---

## Fase 9.6 — Hotfix Aksi Invoice Mobile — 15 Juli 2026

**Root cause dan fix**
- Production memiliki 2 garansi aktif dan 5 kandidat pengganti, tetapi 0 klaim. Select kosong sekarang menampilkan `Belum ada klaim garansi` dan CTA menuju `/warranty?unit=<unit aktif>`.
- Syarat F-WRT-04 tetap utuh: konfirmasi replacement disabled sampai klaim tersedia.
- Toolbar invoice mobile dibuat selebar container; tombol `Cetak invoice` fleksibel mengambil sisa ruang agar tidak terdesak tombol Batalkan.

**Verifikasi dan deployment**
- Typecheck dan production build lulus.
- Vercel production aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-i17bzvy9b-mobimku-1297s-projects.vercel.app`).
- Authenticated Owner smoke test pada invoice aktif: HTTP 200 dan HTML memuat `Cetak invoice`, `Belum ada klaim garansi`, serta `Buat klaim garansi`; sesi sementara direvoke.

---

## Fase 9.5 — Hotfix Owner Login Loop — 15 Juli 2026

**Root cause dan fix**
- `login-form.tsx`, server action, dan dashboard layout sudah menerima role `owner`, tetapi `proxy.ts` masih menolak semua role selain `admin`/`teknisi`.
- Guard pusat diperbaiki menjadi `admin`/`teknisi`/`owner`; tidak ada perubahan credential atau data akun.

**Verifikasi dan deployment**
- Supabase Admin API: tepat satu Owner, email confirmed, akun aktif.
- `npx tsc --noEmit --incremental false` dan `npm run build` lulus.
- Vercel production build sukses dan aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-dnh0o6e8i-mobimku-1297s-projects.vercel.app`).
- Sesi magic-link sementara Owner dipakai untuk request production `/units`: HTTP 200 tanpa redirect; sesi kemudian direvoke.

---

## Fase 9.4 — Sales UX & Mobile Overlay Fixes — 15 Juli 2026

**Apa yang sudah dibangun**
1. Invoice Owner menampilkan tombol "Tukar unit" selama garansi aktif tanpa bergantung pada jumlah klaim/kandidat; dialog memberi alasan jelas dan memblokir konfirmasi jika prasyarat belum ada.
2. Dashboard shell mereservasi tinggi bottom navigation beserta safe-area sehingga layer fixed tidak menutup tombol/konten mobile.
3. Form Sales dibagi dua langkah: detail customer/transaksi yang menampilkan model unit, lalu kuisioner F-SLS-02. Keduanya tetap satu form dan satu submit atomik.
4. `Facebook Marketplace` tersedia sebagai sumber lead di Sales, Servis, edit Customer, Zod, dan constraint database melalui migration `202607150004`.
5. Fixture DB lama diselaraskan dengan kewajiban snapshot F-SLS-02 dan status cancel aktual agar seluruh regression suite kembali runnable.

**Verifikasi**
- `npm run test:db` lulus seluruh suite.
- `npx tsc --noEmit --incremental false` lulus.
- `npm run build` lulus dengan seluruh route terkompilasi.
- ESLint CLI standalone terblokir incompatibility ESLint 10 dengan `eslint-plugin-react`; build/typecheck tetap bersih.
- Playwright tidak dijalankan sesuai instruksi Owner.

**Deployment**
- [x] Supabase migration `202607150004` deployed; local/remote sinkron.
- [x] Vercel production build sukses dan aliased ke `https://bj-stock.vercel.app` (deployment `bj-stock-hw2tphykw-mobimku-1297s-projects.vercel.app`).
- [x] Smoke test: `/login` 200, `/katalog` 200, dan `/sales` tanpa sesi 307 ke `/login`.

**Rekomendasi**
- Owner review invoice aktif dan Sales dua langkah pada 360px/390px; verifikasi tombol bawah tidak tertutup nav.

---

## Fase 9.2–9.3 — Release Replacement + Pre-Payment Test — 15 Juli 2026

**Apa yang sudah dibangun**
1. Alur penggantian unit garansi Owner-only yang atomik, termasuk status unit, garansi baru, penutupan servis, selisih Finance, audit, current-state Sales/CRM/report, riwayat, dan bukti penggantian.
2. Snapshot pre-payment test immutable berisi 12 kategori, 7 hard blocker, acknowledgement server-controlled, dan finalisasi Sales atomik melalui `create_sale(p_test jsonb)`.
3. Form test terintegrasi dalam transaksi jual dan kontrak cetak A4 landscape dengan invoice serta ringkasan test.
4. Migration reconciliation/release `202607150001`–`202607150003` memperbaiki lock finalization, histori nullable, role snapshot, dan current-state untuk sale aktif/non-return.

**Keputusan teknis**
- Snapshot test hanya dibaca Admin/Owner; teknisi tetap dapat membuka detail sale tanpa snapshot.
- `sales_current_state` memakai definer view untuk menyembunyikan completed return secara konsisten, dengan predicate role aplikasi eksplisit agar authenticated tanpa role tidak dapat membaca data.
- Data historis yang memiliki `sales.id_customer` atau `sales.margin` null tetap terbaca; fallback modal/margin dihitung di database, bukan frontend.

**Cara menjalankan/menguji**
1. `npm run test:db` — lulus, termasuk replacement equal/top-up/refund/chain, rollback, finalization lock, F-SLS-02 reconciliation, histori nullable, laporan `3.000.000 - 2.000.000 = 1.000.000`, dan policy snapshot.
2. `npx tsc --noEmit --incremental false`, targeted ESLint, `npm run build`, dan `git diff --check` lulus.
3. `npx supabase migration list` menunjukkan local/remote sinkron sampai `202607150003`.
4. Vercel production build lulus dan alias aktif di `https://bj-stock.vercel.app`; `/` dan `/login` menampilkan form login.

**Status interface**
- [x] Backend Supabase dan frontend Vercel deployed.
- [x] Halaman login production smoke-tested tanpa sesi login.
- [ ] Owner melakukan review manual replacement equal/top-up/refund, role gate, pre-payment test invalid/valid, viewport 360px/390px/desktop, dan print A4 landscape.

**Yang belum selesai / diketahui rusak**
- Tidak ada blocker kode/deployment yang diketahui.
- Review visual dan flow authenticated belum dijalankan karena Owner memilih mengeceknya manual tanpa Playwright.
- TypeScript LSP tidak tersedia; `tsc --noEmit` digunakan sebagai gate tipe.

**Rekomendasi**
- Mulai dari checklist review manual di atas. Jika hasilnya baik, centang item browser-flow Fase 9.2 di `TODO.md` untuk menutup fase sepenuhnya.

---

## Fase 9.2 — Penggantian Unit Dalam Garansi — 14 Juli 2026 (backend deployed, interface pending)

**Apa yang sudah dibangun**
1. Migration `202607140016_warranty_unit_replacement.sql`: event append-only `warranty_replacements`, `sales_current_state`, status guard, kategori Finance selisih, RPC atomik `replace_warranty_unit()`, dan guard `cancel_sale()`.
2. Migration koreksi `202607140017_fase9_2_post_review.sql`: Retur ditolak untuk invoice yang memiliki replacement dan laba/rugi memakai current unit/value/modal tanpa menggandakan Sales.
3. API dan UI Owner-only di detail Sales untuk memilih klaim, unit pengganti, nilai, akun Finance kondisional, alasan, riwayat, dan bukti cetak terpisah dari invoice asli.
4. Daftar Sales, CRM, service customer prefill, margin/turnover/lead report, serta laporan laba/rugi memakai current-state yang sesuai.

**Keputusan teknis**
- `sales` tetap snapshot invoice asli. Penggantian tidak membuat Sales/Retur penuh baru; Finance hanya mencatat top-up/refund selisih.
- Unit lama berpindah `Terjual → QC`, unit pengganti `Ready/Listed → Terjual`, dan service klaim terkait ditutup `Diambil` dalam transaksi yang sama.
- `cancel_sale`, Retur, dan replacement memakai advisory lock invoice yang sama agar operasi final tidak saling mendahului.
- Migration Fase 9.3 dinomori ulang menjadi `202607140018_sale_unit_test_contract.sql`; migration tersebut belum deployed.

**Cara menjalankan/menguji**
1. `npm run test:db` — seluruh suite lulus, termasuk equal replacement, top-up, refund, chain 3×, idempotency, rollback, Cancel/Retur guard, dan P&L `5.500.000 - 4.200.000 = 1.300.000`.
2. `npx tsc --noEmit`, targeted ESLint, dan `npm run build` lulus.
3. Remote Supabase history sudah memuat migration `016` dan `017`; dry-run hanya menawarkan migration `018`.

**Status interface**
- [x] Backend Supabase deployed dan schema fingerprint terverifikasi.
- [ ] Vercel belum dideploy: working tree saat ini juga memuat UI Fase 9.3 yang membutuhkan migration `018`; Owner memilih tidak merilis Fase 9.3 dari sesi ini.
- [ ] Browser QA Owner pada 360px, 390px, desktop, dan print receipt belum dijalankan karena tidak ada credential Owner pada browser terisolasi dan app lokal current tree membutuhkan schema `018`.

**Yang belum selesai / diketahui rusak**
- Production frontend tetap pada release Fase 9.1; UI Fase 9.2 belum tersedia di production.
- `npm run lint` tanpa ignore masih membaca `.next_old`; lint source dengan generated artifacts dikecualikan menghasilkan 0 error dan 6 warning pre-existing.
- TypeScript LSP tidak tersedia karena instalasi sebelumnya ditolak; `tsc --noEmit` dipakai sebagai gate tipe.

**Rekomendasi**
- Selesaikan Fase 9.3 di sesi aktif lainnya, deploy migration `018`, lalu deploy satu Vercel build yang kompatibel dengan migration `016`–`018`.
- Setelah deploy, login Owner dan jalankan flow replacement equal/top-up/refund serta cek Sales, CRM, Finance, report, dan bukti cetak pada viewport 360px/390px/desktop. Baru setelah itu tandai dua checklist terakhir Fase 9.2 selesai.

---

## Fase 9.1 — Analytics Katalog Anonim — 14 Juli 2026

**Apa yang sudah dibangun**
1. Migration `202607140015_fase9_1_catalog_analytics.sql`: tabel `catalog_events`, constraint tiga event, deduplikasi harian Jakarta, RLS tertutup, RPC `record_catalog_event`, dan RPC laporan `get_catalog_analytics(7|30)`.
2. Endpoint `POST /api/catalog/events`: Zod strict validation dan pencatatan via RPC. Browser tidak dapat menentukan `is_internal`; database membacanya dari JWT.
3. Instrumentasi first-party pada katalog: `catalog_view`, `detail_view`, dan `whatsapp_click`. UUID acak disimpan di `localStorage`; tidak ada IP, user agent, fingerprint, lokasi, referrer, email, atau nomor customer.
4. `/reports`: metrik visitor unik, detail view, klik WhatsApp, conversion detail ke WhatsApp untuk 7/30 hari, serta lima unit teratas dalam card responsif tanpa horizontal scroll.
5. `BRD.md`, `FSD.md`, `SPEC.md`, dan `TODO.md` disinkronkan dengan scope, privasi, akses role, dan keterbatasan trafik incognito staf.

**Keputusan teknis**
- Deduplikasi memakai `(event_date Jakarta, session_id, event_type, id_unit)`; refresh pada hari yang sama tidak menggandakan angka, kunjungan hari berikutnya tetap terukur.
- Sesi login `owner`/`admin`/`teknisi` ditandai internal dan dikecualikan dari laporan utama. Staf incognito tetap dihitung publik karena tidak ada fingerprinting.
- Laporan tersedia hanya lewat RPC SECURITY DEFINER dengan gate Admin/Owner. Tabel event tidak memiliki direct policy untuk anon/authenticated.

**Cara menjalankan/menguji**
1. Buka `/katalog` incognito, klik satu unit, lalu klik WhatsApp.
2. Login Admin/Owner dan buka `/reports`; cek metrik 7/30 hari dan unit teratas. Trafik sesi staf yang login tidak boleh menambah statistik publik.
3. Regression DB: `npm run test:db`; typecheck: `npx tsc --noEmit`; build: `npm run build`.
4. Production terverifikasi: event valid mengembalikan HTTP 204, event invalid 400, detail dan klik WA 204, dan `/reports` mengalihkan sesi publik ke `/login`.

**Status interface**
- [x] Deployed ke `https://bj-stock.vercel.app`.
- [x] Katalog dicek pada viewport 360px dan 390px tanpa overflow horizontal.
- [ ] Tampilan metrik `/reports` setelah login perlu review visual Owner/Admin; sesi browser QA tidak memiliki credential login.

**Yang belum selesai / diketahui rusak**
- `npm run lint` masih membaca artifact lama `.next_old` dan gagal pada generated files; bukan error source perubahan ini. TypeScript dan production build lulus.
- Favicon masih 404 di browser; tidak memengaruhi analytics.

**Rekomendasi**
- Review `/reports` sebagai Owner setelah data terkumpul 1–2 hari. Jangan menambah fingerprint/IP kecuali ada kebutuhan bisnis dan kebijakan privasi eksplisit.

---

## Fase 9 — Katalog Publik — 13 Juli 2026

**Apa yang sudah dibangun**
1. **Migration SQL** (`202607130013_fase9_catalog.sql`): seed `store_whatsapp_number` ke `app_settings`, RPC `get_catalog_units()` (grid), `get_catalog_unit(p_id_unit)` (detail), `get_store_whatsapp_number()` (WA button). Semua SECURITY DEFINER agar anon bisa akses tanpa RLS.
2. **Settings API & UI**: `PATCH /api/settings/app-settings` sekarang menerima key `store_whatsapp_number` (text, bukan angka). Form Pengaturan Aplikasi menampilkan field "Nomor WhatsApp Toko" (input `type="tel"`) — Owner isi nomor WA toko dari sana. Read-only untuk non-Owner.
3. **`/katalog`** (publik, server component): grid 2-kolom unit `status = 'Listed' AND harga_listing is not null`. Filter Grade (Semua/A/B/C) sebagai chip URL-based. Sort/price filter dalam bottom sheet native `<dialog>` (Urutkan: Terbaru/Harga termurah/Harga termahal; Rentang harga: Semua/< Rp2jt/Rp2–5jt/> Rp5jt). Card: foto utama (placeholder SVG jika tidak ada), grade stamp, brand, model, `spek_saat_ini` (truncated), harga, id_unit.
4. **`/katalog/[id_unit]`** (publik, server component): galeri foto dengan lightbox (native `<dialog>`, keyboard ←/→/Esc), price, trust badges (Tes Transparan, Garansi Toko), spec sheet (`spek_saat_ini` sebagai blok teks bebas sesuai FSD, `kondisi_fisik` + `kondisi_fungsi` sebagai baris terpisah), unit ID + tanggal masuk, tombol WA sticky (disabled dengan pesan jika `store_whatsapp_number` kosong).
5. **OG meta tags**: `generateMetadata` per detail page — title, description, image (foto pertama), harga. Google/Facebook/WhatsApp preview siap.
6. **"Unit tidak tersedia"**: halaman friendly untuk id_unit tidak ditemukan atau status bukan `Listed` — bukan error mentah, dengan link kembali ke `/katalog`.
7. **BR-09 terverifikasi**: grep `modal_awal`/`total_modal`/`serial_number` pada seluruh file di `app/katalog/` — 0 kemunculan. RPC juga tidak mengekspos field tersebut.

**Keputusan teknis yang diambil**
- **Storage bucket `unit-photos` adalah PUBLIC** — diverifikasi dari `next.config.ts` (image whitelist `public/unit-photos/**`) dan kode existing (`getPublicUrl` bukan `createSignedUrl`). Tidak perlu signed URL atau policy tambahan.
- **3 RPC SECURITY DEFINER** dipilih daripada public RLS policy — lebih aman (eksplisit return field tertentu, tidak bisa SELECT kolom lain), konsisten dengan pola `get_public_service` yang sudah ada.
- **Filter/sort via URL searchParams** — server-side filtering setelah RPC call. Grade chip sebagai `<Link>` (navigation), sort sheet sebagai client component yang set URL params. Bottom sheet memakai native `<dialog>` (konsisten dengan Fase 7.7/7.8).
- **Galori foto sebagai client component** — karena butuh interaktivitas (switch main photo, lightbox with keyboard nav). Mengadopsi pola lightbox dari `photo-gallery.tsx` (Fase 7.7).

**Cara menjalankan/menguji**
1. Jalankan migration di Supabase Dashboard → SQL Editor, paste `supabase/migrations/202607130013_fase9_catalog.sql`, execute.
2. Login sebagai owner → `/settings/app-settings` → isi "Nomor WhatsApp Toko" dengan format `62812xxxxxxx` → save.
3. Pastikan ada unit dengan `status = 'Listed'` dan `harga_listing is not null` (bisa lewat `/units/[id]` → ubah status ke Listed + set harga).
4. Buka `https://bj-stock.vercel.app/katalog` di incognito → grid muncul dengan foto + harga.
5. Klik salah satu unit → detail dengan gallery, klik foto → lightbox navigable.
6. Klik tombol WhatsApp → harusnya terbuka wa.me dengan pre-filled message.
7. Paste link detail unit ke chat WhatsApp → pastikan preview OG muncul (title, foto, deskripsi).
8. Buka `/katalog/BJ-XXXX-9999` (id_unit tidak ada) → halaman "Unit Tidak Tersedia".

**Status interface**
- [x] Interface — semua perubahan deploy ke `https://bj-stock.vercel.app` (setelah build & deploy)

**Keputusan teknis (ditambahkan setelah debugging)**
- **RPC `get_catalog_unit` returns `table(...)` → data always array**: Fungsi SQL didefinisikan `returns table(...)`, sehingga `supabase.rpc()` selalu mengembalikan `data` sebagai array (`CatalogUnit[]`), bukan single object. Kode awal melakukan cast sebagai single object (`CatalogUnit | undefined`), menyebabkan `u?.status` selalu `undefined` (array tidak punya property `status`) dan page selalu render "Unit Tidak Tersedia". Fix: akses `res.data[0]`.
- **Shared fetch cache (`unitCache` Map) tidak menyelesaikan masalah**: Root cause-nya bukan dual RPC call, tapi salah cast tipe data. Setelah fix cast, `generateMetadata` dan page component masing-masing panggil `createClient()` sendiri tanpa issue.

**Yang belum selesai / diketahui rusak**
- Migration Fase 9 sudah di-apply ke Supabase via `supabase db push` (setelah repair history 5 migration lama).
- Build lokal gagal karena EPERM file lock di Windows pada `.next` cache (`npx next build` error `unlink`), bukan error kode. TypeScript `tsc --noEmit` lulus. Build di Vercel CI OK.
- **WA number belum diisi** — tombol WhatsApp di detail page nampilkan "Nomor WA toko belum diatur". Owner perlu mengisi via `/settings/app-settings`.
- **Debug API route** (`/api/debug`) sudah dihapus setelah debugging selesai.

**Rekomendasi**
- Owner isi nomor WA toko via `/settings/app-settings` untuk mengaktifkan tombol WhatsApp di detail katalog.
- Proyek siap untuk fitur tambahan berikutnya sesuai kebutuhan Owner.

---

## Fase 8.2 — Cancel Sales, Cancel Service & Customer CRUD — 12 Juli 2026

**Apa yang sudah dibangun**
1. **Cancel Sales (Owner-only)**: endpoint `POST /api/sales/[id]/cancel` — revert unit ke `Ready`, end warranty, reversal finance via `reverse_transaction` RPC, batalkan receivable cicilan, log ke `admin_actions_log`. UI tombol "Batalkan" di halaman detail invoice.
2. **Cancel Service (Owner-only)**: endpoint `POST /api/service/[id]/cancel` — return parts ke Bank Stock (increment stock_qty), delete part logs, zero-kan biaya_jasa & biaya_part, batalkan receivable, log. UI tombol "Batalkan" di halaman detail servis.
3. **Customer CRUD (Admin & Owner)**: endpoint `PATCH /api/customers/[id]` (edit nama, WA, segmen, sumber lead) + `DELETE /api/customers/[id]` (ditolak 409 bila punya riwayat sales/service). UI tombol "Edit" (modal form native `<dialog>`) + "Hapus" (confirm dialog) di halaman profil customer.

**Keputusan teknis yang diambil**
- **Aplikasi layer instead of migration**: karena Supabase Management API SQL endpoint tidak bisa diakses (404), cancel service tidak bisa set status `Dibatalkan`. Solusi: zero-kan biaya, return parts, dan catat di admin_actions_log. Status `Dibatalkan` akan aktif setelah migration manual dijalankan.
- **Admin client untuk bypass RLS**: cancel service menggunakan `createAdminClient()` (service_role key) untuk operasi yang perlu bypass RLS (update bank_stock, delete part_log). Cancel sales pakai regular client karena sudah ada RLS policy untuk owner.
- **UI pattern**: native `<dialog>` untuk semua confirm modal (konsisten dengan Fase 7.7/7.8). Cancel buttons owner-only dengan role gate di server component.

**Cara menjalankan/menguji**
- Login owner → `/sales/[id_invoice]` → klik "Batalkan" → confirm → cek unit status di `/units` sudah `Ready`.
- Login owner → `/service/[id_servis]` → klik "Batalkan" → confirm → cek parts kembali ke Bank Stock.
- Login admin → `/customers/[id_customer]` → klik "Edit" → ubah nama → save. Klik "Hapus" → confirm (customer dengan riwayat transaksi ditolak).
- ✅ Build/TypeScript lulus (0 error), deploy ke Vercel production.

**Status interface**
- [x] Interface — semua perubahan di-deploy ke `https://bj-stock.vercel.app`

**Yang belum selesai / diketahui rusak**
- `service_orders.status` belum bisa `Dibatalkan` karena perlu migration manual via Supabase dashboard (Management API SQL endpoint unreachable). Migration file sudah siap di `supabase/migrations/202607120012_cancel_sales_service_customer_crud.sql`.
- Mobile scroll fix (h-dvh + body overflow hidden cuma di desktop) sudah di-deploy tapi belum dikonfirmasi Owner.

**Rekomendasi**
- Jalankan migration manual di Supabase Dashboard → SQL Editor:
  ```sql
  alter table public.service_orders drop constraint if exists service_orders_status_check;
  alter table public.service_orders add constraint service_orders_status_check
    check (status in ('Diterima','Diagnosa','Dikerjakan','Selesai','Diambil','Dibatalkan'));
  ```
- Tes scroll HP setelah fix h-dvh.
- Kalau semua OK, lanjut ke maintenance mode / fitur tambahan sesuai kebutuhan Owner.

---

## Fase 8.1 — Owner Role Fixes, Settings UI & Mobile Scroll — 12 Juli 2026

**Apa yang sudah dibangun**
1. **Owner role fixes**: 23 RPC security definer functions dipatch (`is distinct from 'admin'` → `not in ('admin', 'owner')`). 16 API route files diperbaiki (role check include owner). 7 UI page component checks diperbaiki (bank-stock, sales, units, warranty, service, service status-form). Build lulus, deploy ke Vercel.
2. **Settings landing page**: `/settings` sekarang landing page (bukan redirect ke `/settings/accounts`) — nampilin 2 card: "Manajemen Akun" dan "Pengaturan Aplikasi".
3. **UI text color fix**: input fields di settings forms (accounts + app-settings) — tambah `text-[#172019]` biar teks hitam terbaca di background putih.
4. **Mobile scroll fix**: layout `<div>` parent hapus `overflow-hidden` (cuma dipakai di `md:`), content div tambah `flex flex-col` — fix scroll macet di HP (terutama Safari iOS yang block scroll gesture di parent overflow hidden).
5. **Data cleanup**: HP EliteBook 840 G5, INV-2607-001, SVC-2607-001, Customer Seed & Eko — semua data dummy dihapus via Supabase Management API.

**Keputusan teknis yang diambil**
- **`overflow-hidden` hanya di desktop**: parent layout `<div>` punya `overflow-hidden` yang di iOS Safari block scroll gesture di child scroll container. Solusi: pindah `overflow-hidden` ke `md:overflow-hidden` (hanya desktop), content div dikasih `flex flex-col` + `overflow-y-auto`.

**Cara menjalankan/menguji**
- Login sebagai owner → `/settings` → lihat 2 card menu
- Klik "Pengaturan Aplikasi" → ubah `default_warranty_unit_days` → save
- Klik "Manajemen Akun" → buat akun admin/teknisi baru
- `/bank-stock` sebagai owner → seharusnya lihat form tambah part & edit/restock
- Tes scroll di mobile viewport 360px/390px (Chrome devtools atau HP beneran)

**Status interface**
- [x] Interface — semua perubahan sudah di-deploy ke `https://bj-stock.vercel.app`

**Yang belum selesai**
- Fitur hapus sales, hapus servis, dan kelola customer belum ada (perlu dibangun)
- Data dummy/testing sudah dihapus dari database

**Rekomendasi**
- Tes owner role di `https://bj-stock.vercel.app` — login sebagai owner, cek bank stock dan settings. Kalau oke, lanjut bangun 3 fitur yang belum ada.

---

## Fase 8 — Manajemen Akun, Pengaturan & Role Owner — 12 Juli 2026

## Fase 7.9 — Patch: Layout Dashboard Scroll Independen & Sidebar Tetap — 12 Juli 2026

**Apa yang sudah dibangun**
- `app/(dashboard)/layout.tsx` outer wrapper: ganti `min-h-screen overflow-x-hidden md:grid md:grid-cols-[256px_minmax(0,1fr)]` → `flex min-h-screen flex-col md:h-screen md:flex-row` (mobile column, desktop row tinggi viewport). Hapus `md:grid` — flex-row lebih konsisten dengan mobile flex-column, tidak perlu explicit grid-cols. Content div tambah `min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-0` — `min-h-0` penting agar flex item tidak auto-grow ke konten (tanpa ini, `overflow-y-auto` tidak trigger scroll, content stretch parent).
- `components/nav/app-sidebar.tsx` aside: hapus `sticky top-0` (tidak perlu, parent height locked); pertahankan `hidden h-screen w-64 shrink-0 md:flex md:flex-col`. Footer div `border-t` → `mt-auto border-t` (flex-column + `margin-top: auto` → footer selalu push ke bawah walau nav items pendek).
- `app/globals.css`: tambah `html, body { height: 100% }` + `body { overflow: hidden }` — lock window scroll, hanya content area yang scroll. Hindari "double scroll" (window + content area).

**Keputusan teknis yang diambil**
- **`md:h-screen md:flex-row` vs `md:grid md:grid-cols`**: pilih flex-row agar konsisten dengan mobile (`flex flex-col`) — satu sistem flex untuk kedua breakpoint, tidak campur flex+grid. Hapus `sticky top-0` di sidebar — tidak perlu lagi karena parent `md:h-screen` lock tinggi viewport, sidebar menjadi flex item pertama yang mengisi tinggi penuh. Lihat Catatan Keputusan Teknis 2026-07-12.
- **`body { overflow: hidden }`**: lock window scroll agar tidak ada double scroll. Semua modal di aplikasi pakai native `<dialog>` + `showModal()` (Fase 7.7/7.8) yang tidak terpengaruh body overflow lock — `showModal()` bikin dialog top-layer, di luar flow body. Lihat Catatan Keputusan Teknis 2026-07-12.
- **`mt-auto` di footer akun sidebar**: lazy fix 1 class. Flex-column + `margin-top: auto` push footer ke bawah. Sebelumnya footer `border-t` saja — di flex-column, footer bisa menempel ke bawah nav items apabila sidebar kontennya pendek (terlihat di tengah sidebar). Sekarang footer selalu di bawah viewport walau hanya 2-3 nav items. Lihat Catatan Keputusan Teknis 2026-07-12.

**Cara menjalankan/menguji**
- Desktop viewport (≥768px): buka `https://bj-stock.vercel.app` → login admin → buka halaman dengan konten panjang (`/units` jika banyak unit, atau `/units/BJ-ASUS-2607-002`) → pastikan: (1) sidebar hijau tetap di tempat, tidak ikut scroll; (2) konten utama scroll vertikal mandiri (scrollbar di content area, bukan window); (3) footer akun + tombol "Keluar" tetap di bawah sidebar walau nav items pendek; (4) cek juga `/finance`, `/customers` — pastikan semua halaman dashboard berperilaku sama.
- Mobile viewport 360px/390px: layout column, mobile-nav sticky header `top-0` tetap di atas content area saat scroll di dalam content area (bukan window), bottom-nav fixed `bottom-0` overlay, content scroll mandiri.
- Build/lint lokal: `next build` 0/0; `next lint` 0/0; `tsc --noEmit` lulus.

**Status interface**
- [x] Interface — Fase 7.9 deploy ke `https://bj-stock.vercel.app` (alias sukses, deployment `q1eg8r4g2` 52s). Route `/units`, `/finance`, `/service`, `/customers`, `/warranty` semua 200 OK. Bisa direview di browser desktop + mobile.

**Yang belum selesai / diketahui rusak**
- Tidak ada bug diketahui — build/lint/tsc 0/0/0, deploy sukses, route 200 OK. Tinggal review interface manusia di desktop viewport.

**Rekomendasi**
- Buka `https://bj-stock.vercel.app` di desktop viewport ≥768px → login → verifikasi sidebar fixed + content scroll independen + footer akun di bawah. Lalu toggle ke mobile viewport 360px/390px → verifikasi column layout + sticky header + bottom nav + content scroll mandiri.

---

## Fase 7.8 — Patch: Edit Spek via Modal, Riwayat Perubahan & Stricter Delisting — 12 Juli 2026

**Apa yang sudah dibangun**
- Migration `supabase/migrations/202607120009_unit_spec_history_stricter_delist.sql`: `CREATE TABLE unit_spec_history` (id_history uuid, id_unit text FK `units(id_unit) ON DELETE CASCADE`, spek_saat_ini/kondisi_fisik/kondisi_fungsi snapshot, changed_by uuid → auth.users, changed_at timestamptz default now(), catatan text). RLS enable + grant `authenticated` select/insert. Index `idx_unit_spec_history_id_unit_changed_at` untuk timeline query cepat. Trigger `snapshot_unit_spec()` `AFTER INSERT` (catatan "Spek awal saat unit dibuat") + `AFTER UPDATE OF spek_saat_ini, kondisi_fisik, kondisi_fungsi` (pakai `IS DISTINCT FROM` untuk NULL-safe compare). Backfill semua unit eksisting → 2 row history verified via Management API. RPC `delist_unit` update: tambah cek `active_service_count FROM service_orders WHERE status IN ('Diterima','Diagnosa','Dikerjakan')` → raise exception kalau > 0.
- `lib/validation/unit.ts`: tambah `specHistorySchema` (zod array).
- `PATCH /api/units/[id]` route: `editSchema` hanya `spek_saat_ini`/`kondisi_fisik`/`kondisi_fungsi` (opsional). Field lain (brand, model, serial, sumber_beli, spek_awal, modal_awal, tanggal_masuk) → 400 dengan msg "Field X tidak dapat diubah setelah create. Lihat F-STK-06."
- `edit-form.tsx` rewrite: `<dialog>` modal controlled `open`/`onClose`. 3 field pre-filled: textarea `spek_saat_ini`, select A/B/C `kondisi_fisik`, input teks `kondisi_fungsi`. Cancel + Save buttons. Submit fetch `PATCH /api/units/[id]`, `router.refresh()`, `onClose()`. Error inline di modal.
- `edit-spec-button.tsx` (new): client wrapper. Tombol "Edit spek & kondisi" (outline amber) → toggle `open` state → render `<EditUnitForm open={open} onClose=... unit={unit} />`. Admin-only (parent gating via `page.tsx`).
- `spec-history.tsx` (new): server component. Render timeline `<ol>` dari `unit_spec_history` sort `changed_at desc`. Badge "Terbaru" untuk index 0, badge "Spek awal" untuk entry dengan `catatan = "Spek awal saat unit dibuat"` atau paling bawah. Format `changed_at` Indonesia locale. Diff ketiga field dengan placeholder "-" bila null.
- `delist-form.tsx` rewrite: split jadi `DelistButton` (primary outline-red button → buka `<dialog>` modal dengan pilih jenis 4 skenario + alasan textarea, konfirmasi ganda untuk `salah_input`) dan `ReactivateButton` (preserved).
- `page.tsx` rewrite: `Promise.all` fetch unit + upgrade + service + warranty + **spec history**. Section "Spek & Kondisi" dengan heading + `<EditSpecButton>` + current spec ringkas + expandable `<details>` "Riwayat perubahan spesifikasi" rendering `<SpecHistory>`. DelistButton di action row alongside Jual/Terima Servis. Hapus `Detail` helper function (unused setelah rewrite — grid inline dipakai langsung).
- `SPEC.md` update: Trigger list §3 tambah 6 (`AFTER INSERT ON units` snapshot awal) + 7 (`AFTER UPDATE OF spek_saat_ini, kondisi_fisik, kondisi_fungsi ON units`); §3.3 baru "Riwayat Spesifikasi Unit (`unit_spec_history`)" dengan schema, aturan, tampilan, modal edit, permission; §3.4 baru "Stricter Delisting — Pembatasan Tambahan" dengan aturan cek service order aktif + skenario `salah_input`; §5 API table update `PATCH /api/units/[id]` + catatan stricter delist di `POST /api/units/[id]/delist`.
- `FSD.md` update: F-STK-04 tambah tombol UI + stricter block + modal dialog; F-STK-06 baru "Edit Spek & Kondisi + Riwayat Perubahan" dengan field editable, alur edit, tampilan timeline, permission.
- `TODO.md`: Fase 7.8 entry (12 task, 11 `[x]`, 1 `[ ]` deploy pending), 4 catatan keputusan teknis (edit opsi B, stricter delist, modal native, trigger IS DISTINCT FROM).

**Keputusan teknis yang diambil**
- **Edit spek opsi B (`spek_awal` frozen + history table)**: keputusan user. `spek_awal` di kolom `units` tetap read-only (immutable) sebagai snapshot statis. Edit terjadi di `spek_saat_ini` (live) + audit trail di `unit_spec_history`. Lebih backward-compatible dari opsi A (overwrite `spek_awal` + insert row backup). Field `brand`/`model`/`serial`/`sumber_beli`/`modal_awal`/`tanggal_masuk` juga {{immutable}} — typo fix lewat delist `salah_input` + re-create.
- **Stricter delist menolak service order aktif**: `RPC delist_unit` sekarang cek `count(*) FROM service_orders WHERE id_unit=$1 AND status IN ('Diterima','Diagnosa','Dikerjakan')`. Raise exception bila > 0. Alasan: hindari orphan FK + UX pesan error jelas. Skenario `salah_input` (hard delete) tetap berjalan bila cek service aktif lulus — service `Selesai`/`Diambil` tidak block.
- **Modal native `<dialog>`**: semua modal Fase 7.8 (edit spek, delist) pakai `<dialog>` + `showModal()`/`close()` — konsisten dengan lightbox Fase 7.7. Nol dependency, native backdrop + focus trap + scroll lock.
- **Trigger `IS DISTINCT FROM`**: comparison NULL-safe di PostgreSQL. Trigger INSERT row satu history baru bila salah satu field berubah (`spek_saat_ini IS DISTINCT FROM NEW.spek_saat_ini OR kondisi_fisik IS DISTINCT FROM NEW.kondisi_fisik OR kondisi_fungsi IS DISTINCT FROM NEW.kondisi_fungsi`). Bila tak ada field berubah → no-op short-circuit (return NEW), jadi user klik Save tanpa edit tetap 200 OK.

**Cara menjalankan/menguji**
- Lokal: `npm run dev` → login admin (`admin@bjstock.test` / `rQ7!vM2#xP9@kL4$wT8&cN6`) → buka `/units/<id_unit>` → klik "Edit spek & kondisi" → modal muncul dengan 3 field pre-filled → edit salah satu → Save → halaman refresh, current spec update, expand "Riwayat perubahan spesifikasi" → entry baru muncul dengan badge "Terbaru". Test cek `unit_spec_history` table via Supabase Studio.
- API test: `curl -X PATCH -H "Content-Type: application/json" -d '{"brand":"Foo"}' http://localhost:3000/api/units/<id_unit>` → harus 400 "Field brand tidak dapat diubah setelah create".
- Stricter delist test: buat unit → buat service_order untuk unit itu (status `Diterima`) → coba delist unit via UI button → modal error "Unit tidak dapat delist karena masih ada 1 service order aktif". Update service status ke `Diambil` → delist unit lagi → berhasil.
- Mobile test wajib: viewport 360px/390px → modal edit spek tidak overflow, scroll lock saat terbuka, tombol Save/Cancel reachable. Timeline vertical stack readable.

**Status interface**
- [x] Interface — Fase 7.8 deploy ke `https://bj-stock.vercel.app` (alias sukses, deployment `9fvr454uw` selesai 44s). Build/lint lokal 0/0. Production 200 OK untuk `/` + `/units/BJ-ASUS-2607-002`. Bisa direview di browser. Wajib direview di viewport 360px/390px.

**Yang belum selesai / diketahui rusak**
- Tidak ada bug diketahui lokal — build/lint/tsc 0/0, deploy Vercel sukses, production live. Tinggal: review interface manusia 4 skenario (lihat TODO.md Fase 7.8 § "Review interface").

**Rekomendasi**
- Deploy Vercel: `& "node_modules\.bin\vercel.cmd" --prod --yes --token $tok` → tunggu selesai → buka `https://bj-stock.vercel.app/units/<id_unit>` (unit yang ada: `BJ-ASUS-2607-002` atau `BJ-HP-2607-001`) → review interface Fase 7.8 sesuai TODO.md §"Review interface" 4 skenario.
- Bila Vercel build error karena `images.remotePatterns` (Fase 7.7) → cek build log host resolusi dari `NEXT_PUBLIC_SUPABASE_URL`, fallback hardcoded `ksecrddwowrswfcbdknf.supabase.co` akan dipakai bila env var kosong.

---

## Fase 7.7 — Patch: Galeri Foto, Lightbox & Mobile-Friendly Delete — 12 Juli 2026

**Apa yang sudah dibangun**
- `next.config.ts`: tambah `images.remotePatterns` untuk host Supabase (`${NEXT_PUBLIC_SUPABASE_URL}` di-parse pakai `new URL().host`), pathname `/storage/v1/object/public/unit-photos/**`. Config memakai env var saat build agar domain tidak hardcode.
- `photo-gallery.tsx` rewrite: prop `canDelete` (default `false`) untuk gating tombol hapus — satukan admin & non-admin ke satu komponen (sebelumnya `page.tsx` punya inline `<section>` duplikat untuk non-admin).
- Lightbox pakai native `<dialog>` + `showModal()`/`close()` di `useEffect` sinkron dengan state `lightboxIndex`. Image full-size `object-contain` tidak di-crop, max `92vw × 86vh`. Navigasi: tombol ←/→ di bawah image, keyboard ←/→ via `window.addEventListener("keydown")` ( efek cleanup), Esc via native dialog behaviour + onClick backdrop (`e.target === dialogRef.current` → tutup). Indikator posisi `1/4` tampil bila foto > 1. Tutup dialog via Esc / backdrop / tombol ✕.
- Hp-friendly delete: tombol hapus `size-7 bg-red-600` dengan kelas `sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100` — selalu visible di viewport < 640px (mobile), hover-only di >= 640px (desktop). Alternatif long-press ditolak (bukan konvensi, clutter, unreliable).
- Thumb pakai `next/image` dengan `width=400 height=300 sizes="(max-width: 640px) 50vw, 33vw" unoptimized` — Supabase Storage Free plan tidak punya Image Transformation API. walau `unoptimized`, `next/image` tetap memberi lazy loading + prevent CLS + sizes hint. Lightbox image `width=1600 height=1200 quality=90 unoptimized`.
- `page.tsx`: hapus inline `<section>` non-admin (11 baris), panggil `<PhotoGallery id fotoUrl canDelete={role === "admin"} />`. Hapus `eslint-disable @next/next/no-img-element` di bagian foto. `eslint-disable` untuk `<img>` QR di `/api/units/[id]/qr` tetap dipertahankan (route generasi PNG on-the-fly, bukan remote image).
- `SPEC.md` update: tambah §3.2 "Storage Supabase & Foto Unit" (bucket, path, constraint, alur signed URL, tampilan galeri + lightbox, edge case), §5 API table (POST/PUT/DELETE `/api/units/[id]/photos`), §5 catatan `POST /api/units` tanpa foto.
- `FSD.md` update: F-STK-01 step 1 (foto dipisah), step 5 baru (redirect ke detail lalu upload foto), tambah F-STK-05 "Galeri Foto Unit & Lightbox" dengan constraint, tampilan, lightbox, alur hapus.

**Keputusan teknis yang diambil**
- **Native `<dialog>` vs lib lightbox**: pilih `<dialog>` + `showModal()` (HTML spec, zero dependency). Native backdrop + scroll lock + focus trap built-in. Trade-off: styling minimal perlu kelas Tailwind sendiri. Lihat Catatan Keputusan Teknis 2026-07-12 di TODO.md.
- **HP-friendly delete: always-visible vs long-press**: pilih always-visible tombol hapus di mobile, `group-hover` di desktop. Long-press ditolak — bukan konvensi galeri, tidak discoverable, perlu timer + cancel-on-scroll. Maks 4 foto → clutter minimal.
- **`next/image` dengan `unoptimized`**: Supabase Free plan tidak punya Image Transformation API. Walau `unoptimized`, `next/image` tetap beri lazy load + CLS prevention + sizes hint + konsistensi dengan `next/image` di halaman receipt lain (sales/service/aftersales receipt). Domain Supabase di-whitelist di `next.config.ts images.remotePatterns`.
- **Swordan admin dan non-admin ke satu komponen**: sebelumnya `PhotoGallery` (admin, ada tombol hapus) dan inline `<section>` (non-admin, read-only) duplikat grid layout. Sekarang satu `PhotoGallery` dengan prop `canDelete=false` default; tambah lightbox tetap aktif untuk non-admin (read-only user tetap boleh preview foto besar, cuma tidak boleh hapus).

**Cara menjalankan/menguji**
- Lokal: `npm run dev` → login admin → buka `/units/<id_unit>` (ada unit dengan foto: `BJ-ASUS-2607-002` ASUS E410m punya 2 foto PNG) → klik thumb → lightbox buka full-size → cek ←/→ + Esc (keyboard) → klik backdrop → tutup. Login sebagai teknisi → buka detail unit yang sama → tombol hapus thumb tidak ada, lightbox tetap bisa buka.
- Mobile test wajib: buka devtools → toggle mobile viewport 360px/390px → cek tombol hapus selalu visible (tidak perlu hover), cek thumb 2-kolom, cek lightbox full-viewport tidak overflow.
- Build/lint lokal: `next build` Errors=0 Warnings=0; `next lint` same; `tsc --noEmit` lulus.

**Status interface**
- [x] Ada interface — `PhotoGallery` di halaman detail unit dengan lightbox + tap-friendly delete + `next/image`. Bisa direview di browser. Wajib direview di viewport 360px/390px.

**Yang belum selesai / diketahui rusak**
- Belum deploy ke Vercel production. `next.config.ts` parse domain dari `NEXT_PUBLIC_SUPABASE_URL` saat build — domain yang di-whitelist adalah host yang ada di env Vercel project (Vercel punya `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` terseting). Seharusnya tidak ada masalah, tapi build production wajib verifikasi `images.remotePatterns` mengenali domain Supabase (bila env var mis-named di Vercel → fallback hardcoded `ksecrddwowrswfcbdknf.supabase.co` akan dipakai, masih benar).
- `package.json` masih punya `sharp` di dependencies — tidak ada caller lagi grep menemukan (kecuali `next/image` butuh `sharp` internal untuk optimasi, tapi dengan `unoptimized` flag, `sharp` tidak wajib di runtime). Tetap di deps supaya tidak trigger `next build` warning bila fallback dipakai.

**Rekomendasi**
- Deploy Fase 7.7 ke Vercel → buka `https://bj-stock.vercel.app/units/BJ-ASUS-2607-002` → klik thumb foto → pastikan lightbox muncul, ←/→/Esc bekerja, prev/next ambil semua foto (2 foto), tombol hapus visible di HP viewport.
- Bila di Vercel `next/image` error "domain not configured" → cek build log yang mencatat host resolusi dari `NEXT_PUBLIC_SUPABASE_URL`. Kalau env var tidak ter-set di build Vercel, edit `next.config.ts` untuk hardcode fallback (sudah hardcode `ksecrddwowrswfcbdknf.supabase.co` sebagai fallback, jadi aman).

---

## Fase 7.6 — Patch: Photo Upload via Signed URL — 12 Juli 2026

**Apa yang sudah dibangun**
- `POST /api/units` (unit creation) berubah dari FormData (multipart) ke JSON body; pipeline `sharp` + `supabase.storage.upload()` dihapus. Foto unit tidak lagi diupload saat create — admin redirect ke halaman detail unit untuk tambah foto via `PhotoUploadForm`. Argumen RPC `create_unit` dengan field opsional di-coerce `undefined → null` agar PostgREST cache hit (PGRST202 → 500 fix).
- `POST /api/units/[id]/photos` (admin) generate signed upload URLs: validasi `id_unit` eksis di DB, cek `foto_url.length < 4`, body `{ count, fileExt }`, kembalikan `{ uploads: [{ signedUrl, path, token }] }` — masing-masing path `${id_unit}/${uuid}.<ext>`, satu signed URL per foto.
- `PUT /api/units/[id]/photos` (admin) commit uploaded paths: validasi prefix `${id_unit}/`, cek total ≤4 setelah commit, ambil `getPublicUrl` untuk tiap path, update `foto_url` array di DB.
- `DELETE /api/units/[id]/photos` preserved — hapus file Storage + update `foto_url` (set `null` jika kosong).
- `PhotoUploadForm` client di-rewrite: file picker (≤ remaining slot, ≤5MB, JPG/PNG/WebP) → POST dapat signed URLs → `PUT` binary ke tiap signed URL → PUT commit ke API → `router.refresh()`. Phase indicator (preparing/uploading X/Y/committing) + error message.
- `UnitForm` (`/units/new`) di-rewrite: kirim JSON (bukan FormData), hapus field foto, info text "Foto bisa ditambahkan setelah unit disimpan, di halaman detail unit".
- Dependency `sharp` dihilangkan dari kedua route unit (masih ada di `package.json` untuk skenario resize lain bila nanti diperlukan — tidak lagi dipanggil dari hot path upload).

**Keputusan teknis yang diambil**
- **Signed URL flow sebagai ganti server-side upload**: penyebab korupsi binary adalah Vercel serverless Node 20 `fetch`/body handler tidak mempertahankan byte binary saat diteruskan ke `supabase.storage.upload()` lewat server-side client. Di lokal (Node 22, Windows) tidak terjadi — masalah spesifik runtime. Solusi: server hanya generate signed upload URL, client browser `PUT` langsung ke Supabase Storage — byte binary tidak pernah melewati Vercel.
- **Sharp pipeline di-drop untuk sekarang**: client upload raw file (sesuai asli, ≤5MB) ke Storage. Jika nanti perlu resize/konversi ke WebP, bisa di-handle client-side (Canvas API di browser sebelum upload) atau via Supabase Image Transformations (butuh Pro plan, saat ini plan unknown). YAGNI — file asli cukup untuk kebutuhan admin lihat foto unit.
- **Foto dipisahkan dari unit creation**: dulu disatuin dengan FormData, sekarang step terpisah. Trade-off: unit bisa dibuat tanpa foto (slot kosong), tapi flow lebih jelas dan tidak ada FormData multipart yang melibatkan binary dari client → server → storage.
- **Path prefix validation di PUT commit**: server cek `paths.every(p => p.startsWith(\`${id_unit}/\`))` untuk mencegah admin commit foto ke folder unit lain. Slot limit di-enforce di POST (saat generate) dan PUT (saat commit).

**Cara menjalankan/menguji**
- Lokal: `npm run dev` → login admin → `/units/new` → isi form (tanpa foto) → simpan → redirect ke `/units/[id]` → tambah foto via form "Tambah foto" di halaman detail.
- Verifikasi integrity file: WebP yang diupload masih punya header RIFF (`52 49 46 46`) valid, tidak ada byte `ef bf bd` (U+FFFD) — sebelumnya yang korup ada 12+ instance U+FFFD.
- Test endpoint via script (sudah diverifikasi):
  1. Login admin → dapat cookie SSR `sb-<ref>-auth-token`.
  2. `POST /api/units` JSON body → 201 + `{ idUnit }`.
  3. `POST /api/units/[id]/photos` `{ count: 1, fileExt: "webp" }` → 200 + `uploads[{ signedUrl, path, token }]`.
  4. `PUT ${signedUrl}` binary + Content-Type → OK.
  5. Verify via `${SUPABASE_URL}/storage/v1/object/public/unit-photos/${path}` → len, RIFF=true, FFFD=0 → PASS.
  6. `PUT /api/units/[id]/photos` `{ paths: [...] }` → 200, `foto_url.length = 1`.
  7. `DELETE /api/units/[id]/photos` `{ url }` → 200, foto_url.length = 0.
  8. `POST` dengan `count: 5` → 400 "Jumlah foto tidak valid (1-4)." (limit enforcement works).
  9. Cleanup test unit & storage file.
- Build/lint lokal: `next build` Errors=0 Warnings=0; `next lint` same. (`eslint` CLI standalone error karena incompat TS 7 vs typescript-estree 8.63 — environment issue, bukan kode; `next lint` via Next config lulus.)

**Status interface**
- [x] Ada interface — `PhotoUploadForm` di halaman detail unit form upload foto (multi-phase indicator), `UnitForm` di `/units/new` tanpa input file. Bisa direview di browser.

**Yang belum selesai / diketahui rusak**
- Belum deploy ke Vercel (token invalid lokal). Owner perlu push ke `main` atau `vercel login` untuk verifikasi binary corruption benar-benar hilang di production runtime Node 20.
- `package.json` masih punya `sharp` di dependencies — bisa diuninstall bila benar-benar tidak lagi dipakai di mana pun. Cek dulu apakah ada caller lain (saat ini tidak ditemukan).

**Rekomendasi**
- Deploy ke Vercel → upload 1 foto unit WebP/JPG → buka URL `unit-photos/<id_unit>/<uuid>.<ext>` langsung → pastikan gambar load di browser (sebelumnya broken karena U+FFFD).
- Jika di Vercel production binary corruption masih muncul: pastikan client component benar-benar melakukan `PUT` ke `signedUrl` (bukan `POST /api/...`), dan tidak ada proxy/middleware Next.js yang `await request.text()`/`request.formData()` di chain request binary.

## Fase 7.5 — Unit Delisting & Edit — 11 Juli 2026

**Apa yang sudah dibangun**
- Migration `202607110007_unit_delisting.sql`: status `Delisted` ditambah ke CHECK constraint `units`; kolom `delist_jenis`, `delist_alasan`, `delist_tanggal` ditambah.
- Trigger `enforce_unit_status_transition` diupdate: izinkan `Ready/Listed → Delisted` (via `app.delist_flow`) dan `Delisted → Ready` (via `app.reactivate_flow`).
- RPC `delist_unit(p_id_unit, p_alasan, p_jenis)`: validasi status Ready/Listed, ubah ke Delisted, reversal finance otomatis untuk `retur_supplier`/`salah_input`, hard delete untuk `salah_input`.
- RPC `reactivate_unit(p_id_unit)`: kembalikan status Delisted ke Ready; jika sebelumnya ada reversal finance, buat transaksi `Pembelian Unit` baru.
- API routes: `POST /api/units/[id]/delist` dan `POST /api/units/[id]/reactivate` (admin-only, zod validation).
- UI halaman detail unit: form "Delist unit" (pilih jenis + alasan, konfirmasi ganda untuk salah_input), info delist (jenis/alasan/tanggal) saat status Delisted, tombol "Reactivate ke Ready".

**Keputusan teknis yang diambil**
- Unit tidak pernah dihapus dari DB kecuali skenario `salah_input` (unit tidak pernah ada secara fisik) — ini menjaga integritas finance, upgrade_log, dan QR code.
- Reversal finance pada delist meng-iterate semua transaksi finance terkait unit (`source_module = 'Stock'` && `source_id = id_unit`) dan membuat reversal untuk masing-masing.
- `salah_input` hard delete: hapus `upgrade_log` dulu (FK), lalu hapus `units` row. Finance reversal tetap ada di `finance_transactions` sebagai audit trail.
- Reactivate memakai `gen_random_uuid()` di `source_event_key` agar tidak conflict dengan transaksi purchase asli.

**Cara menjalankan/menguji**
- Buka detail unit berstatus Ready/Listed → klik "Delist unit" → pilih jenis dan isi alasan.
- Untuk retur_supplier: verifikasi di `/finance` ada transaksi reversal (kas masuk).
- Untuk salah_input: verifikasi unit hilang dari daftar setelah konfirmasi ganda.
- Buka detail unit Delisted → klik "Reactivate ke Ready" → verifikasi status kembali Ready dan finance tercatat.
- Jalankan `npm run test:db` — test delist rusak, retur_supplier + reactivate, salah_input (hard delete), dan tolak delist unit Terjual.

**Status interface**
- [x] Ada interface — bisa direview di halaman detail unit (`/units/[id]`)

**Yang belum selesai / diketahui rusak**
- ~~Edit field unit (brand, model, …) belum diimplementasi~~ — **Resolved 2026-07-23**: brand/model + spek/kondisi editable Admin/Owner; serial/sumber/modal/tanggal/spek_awal tetap immutable (lihat entri Hotfix pasca-restore).

**Rekomendasi**
- Owner review: delist satu unit dengan jenis `retur_supplier`, pastikan reversal finance muncul di arus kas; lalu reactivate dan pastikan transaksi baru muncul.

---

## Fase 7 — Polish & Hardening — 11 Juli 2026

**Apa yang sudah dibangun**
- Review keamanan: `SUPABASE_SERVICE_ROLE_KEY` tidak dipakai di kode aplikasi mana pun; hanya `NEXT_PUBLIC_*` vars yang dipakai di client. `.env` dan `.env.*` di `.gitignore` (kecuali `.env.example`). Tidak ada file `.env` yang ter-commit.
- Edge-case test: opex jumlah 0 ditolak, opex catatan kosong ditolak, modal negatif ditolak, reversal ganda ditolak, retur refund 0 ditolak, pembayaran idempotent dengan data sama return existing, event key sama dengan data berbeda ditolak.
- Responsif: semua halaman pakai class responsif (`max-w-*`, `sm:`/`lg:` breakpoints, `overflow-x-auto` untuk tabel). Bottom tab bar + drawer untuk mobile sudah ada.
- Export CSV: route `GET /api/export/[table]` untuk 15 tabel utama, admin-only, return CSV dengan header `Content-Disposition`. Halaman `/export` menampilkan tombol download per tabel dikelompokkan per modul.
- Dokumentasi operasional: halaman `/help` dengan panduan admin (tambah unit, sales, servis, upgrade, finance, retur, export) dan teknisi (scan, update servis, lihat detail), plus aturan penting.

**Keputusan teknis yang diambil**
- Export CSV tidak memakai `ORDER BY` agar tidak gagal untuk tabel tanpa kolom `created_at`; urutan mengikuti default database.
- Halaman help dibuat sebagai Server Component tanpa auth check tambahan (sudah ada di layout) agar bisa diakses semua role yang sudah login.
- Navigasi: "Export" dan "Help" ditambahkan ke sidebar dan drawer, admin-only untuk Export, semua role untuk Help.

**Cara menjalankan/menguji**
- Buka `/export` sebagai admin, unduh salah satu CSV.
- Buka `/help` sebagai admin dan teknisi.
- Jalankan `npm run test:db`, `npm run lint`, `npx tsc --noEmit`, dan `npm run build`.
- Bukti test: edge-case (upgrade biaya 0, opex 0 ditolak, reversal ganda ditolak, idempotent payment) terverifikasi.

**Status interface**
- [x] Ada interface — bisa direview di: `/export` dan `/help` (belum checkpoint UI operasional)

**Yang belum selesai / diketahui rusak**
- Tidak ada untuk Fase 7.

**Rekomendasi**
- Owner melakukan sign-off akhir: buka semua halaman di mobile dan desktop, jalankan satu transaksi end-to-end (unit → sales → servis → finance → retur → export), lalu sistem siap dipakai untuk transaksi riil.

---

## Fase 6 — Dashboard & Laporan — 11 Juli 2026

**Apa yang sudah dibangun**
- Migration `202607110006_dashboard_reports.sql` membuat 6 function PostgreSQL (semua `security definer`, admin-only, `stable`): `get_dashboard_summary`, `get_active_services`, `get_warranty_expiring`, `get_margin_report`, `get_stock_turnover`, `get_lead_conversion`.
- Halaman `/dashboard` menampilkan ringkasan: jumlah unit per status (badge berwarna per status), daftar servis aktif (Diterima/Diagnosa/Dikerjakan), daftar garansi akan habis dalam 7 hari.
- Halaman `/reports` menampilkan tiga laporan dengan filter periode (start/end date): margin per brand, perputaran stock (rata-rata hari Masuk → Terjual), dan distribusi sumber lead vs konversi (sales + servis + total revenue).
- Navigasi: item "Dashboard" dan "Laporan" ditambahkan ke sidebar (desktop) dan drawer (mobile), admin-only. Root `/` sekarang redirect ke `/dashboard`.
- Semua perhitungan dilakukan server-side di PostgreSQL functions, konsisten dengan BR-06 dan pola Fase 5.

**Keputusan teknis yang diambil**
- `get_stock_turnover` menerima parameter periode (start/end date) agar bisa difilter; `rata_rata_hari` dihitung dari `avg(s.tanggal_transaksi - u.tanggal_masuk)`.
- `get_warranty_expiring` memakai parameter `p_days` (default 7) agar fleksibel; mengembalikan `sisa_hari` dihitung dari `current_date`.
- `get_lead_conversion` melakukan LEFT JOIN customers ke sales dan service_orders agar semua sumber lead tampil meski belum ada konversi; revenue dihitung dari `harga_jual` (sales) + `total_biaya` (servis).
- Dashboard dan reports dipisah ke route berbeda (`/dashboard` vs `/reports`) agar ringkasan operasional tidak tertumpuk dengan analitik periode.

**Cara menjalankan/menguji**
- Buka `/dashboard` dan `/reports` sebagai admin; pastikan teknisi ditolak (redirect ke `/scan`).
- Jalankan `npm run test:db`, `npm run lint`, `npx tsc --noEmit`, dan `npm run build`.
- Bukti test: dashboard summary mengembalikan unit per status; margin report total > 0; stock turnover terverifikasi; lead conversion total revenue > 0.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada interface — bisa direview di: `/dashboard` dan `/reports` (belum checkpoint UI operasional)

**Yang belum selesai / diketahui rusak**
- Tidak ada untuk Fase 6.

**Rekomendasi mulai fase berikutnya dari mana**
- Mulai Fase 7 dari review keamanan (`SUPABASE_SERVICE_ROLE_KEY`), lalu uji responsif HP untuk semua halaman termasuk `/dashboard` dan `/reports`.

---

## Fase 6 — Dashboard & Laporan — 11 Juli 2026

**Apa yang sudah dibangun**
- Migration `202607110006_dashboard_reports.sql` membuat 6 function PostgreSQL (semua `security definer`, admin-only, `stable`): `get_dashboard_summary`, `get_active_services`, `get_warranty_expiring`, `get_margin_report`, `get_stock_turnover`, `get_lead_conversion`.
- Halaman `/dashboard`: ringkasan unit per status (Masuk/QC/Ready/Listed/Terjual/Selesai), daftar servis aktif (Diterima/Diagnosa/Dikerjakan), daftar garansi akan habis dalam 7 hari.
- Halaman `/reports`: laporan margin per brand/periode (revenue, margin, margin rata-rata), perputaran stock (rata-rata hari Masuk → Terjual per brand), distribusi sumber lead vs konversi (jumlah customer, konversi sales, konversi servis, total revenue).
- Navigasi: item "Dashboard" dan "Laporan" ditambahkan ke sidebar (admin-only) dan drawer mobile.
- Root `/` sekarang redirect ke `/dashboard` (sebelumnya ke `/units`).
- Filter periode berlaku untuk margin, turnover, dan lead conversion.

**Keputusan teknis yang diambil**
- Semua laporan dihitung server-side via PostgreSQL function (BR-06), konsisten dengan Fase 5.
- `get_stock_turnover` menerima parameter periode (start, end) sama seperti laporan lain; turnover hanya menghitung unit yang sudah terjual (join `sales` × `units`).
- `get_warranty_expiring` default 7 hari ke depan, terkait F-CRM-02 "reminder H-7".
- Dashboard admin-only; teknisi redirect ke `/scan` (FSD §4 matriks aktor: Dashboard & Laporan = Admin).

**Cara menjalankan/menguji**
- Buka `/dashboard` dan `/reports` sebagai admin; login sebagai teknisi dan pastikan redirect ke `/scan`.
- Jalankan `npm run test:db`, `npm run lint`, `npx tsc --noEmit`, dan `npm run build`.
- Bukti test: dashboard summary mengembalikan unit per status; margin report total > 0; turnover terverifikasi numeric; lead conversion total revenue > 0.

**Status interface**
- [x] Ada interface — bisa direview di: `/dashboard` dan `/reports` (admin-only)

**Yang belum selesai / diketahui rusak**
- Tidak ada untuk Fase 6.

**Rekomendasi mulai fase berikutnya dari mana**
- Mulai Fase 7 dari review keamanan (service role key), lalu uji responsif HP dan edge-case trigger uang.

---

## Fase 5 — Finance — 11 Juli 2026

**Apa yang sudah dibangun**
- Migration `202607110005_finance_module.sql` membuat `finance_accounts`, `finance_transactions`, `receivables`, `finance_payments`, `returns`, `bank_stock_restock` (event log restock untuk idempotency), beserta seed akun default `Kas Toko` dan `Bank Utama`.
- RLS eksplisit admin-only pada semua 6 tabel Finance; role `teknisi` tidak memiliki policy matching sehingga ditolak total (SPEC §3.1 pt.11).
- F-FIN-01: trigger `journal_unit_purchase` (pembelian unit), `journal_part_restock` (restock part), `journal_external_upgrade` (biaya upgrade eksternal dengan koreksi insert/update/delete) — semua idempotent via `source_event_key` unique + `record_finance_txn` helper.
- F-FIN-03: `complete_sale` trigger membuat jurnal penerimaan penuh untuk Tunai/Transfer dan membuat `receivables` untuk Cicilan; RPC `record_sale_payment` dan `record_service_payment` mencatat pembayaran atomik (finance_txn + finance_payments + update piutang).
- F-FIN-02: RPC `record_opex` (biaya operasional manual) dan `reverse_transaction` (transaksi pembalik + koreksi piutang).
- F-FIN-05: RPC `record_modal_disetor` (setoran modal owner, kategori `Modal Disetor`).
- F-FIN-06: RPC `process_return` — atomik: insert `returns`, jurnal refund `Retur Unit/Servis` arah Keluar, kembalikan `units.status` ke `Ready`, set `warranty.status` ke `Habis`. Tidak menghapus sales/servis asli.
- F-FIN-04: function `get_cash_flow`, `get_receivables` (dengan umur piutang), `get_profit_loss` (pendapatan − retur − HPP − biaya part − operasional).
- Halaman `/finance` menampilkan arus kas, piutang, laba rugi + form opex/modal/payment/reversal/retur. `POST /api/finance` admin-only (403 untuk non-admin). Frontend generate `eventKey` sekali per `(action, sourceId)` via `useRef` agar retry tidak duplikasi.
- Immutability: trigger `protect_finance_transactions` memblok UPDATE/DELETE; koreksi hanya lewat reversal.
- Anti-double-count: pemakaian part dari Bank Stock tidak membuat kas keluar baru (uang sudah keluar saat restock); biaya part masuk ke laporan via snapshot `service_orders.biaya_part`.

**Keputusan teknis yang diambil**
- `bank_stock_restock` ditambah sebagai tabel event log terpisah agar setiap restock punya ID unik untuk `source_event_key` idempotent.
- Reversal tidak hanya membuat transaksi pembalik tapi juga mengoreksi `receivables.total_dibayar` dan `status` agar piutang tetap akurat.
- Retur langsung berstatus `Selesai` (bukan `Diproses`) karena refund dicatat dalam transaksi yang sama; FSD menyebut status `Diproses` sebagai opsi sebelum refund dibayarkan, tapi implementasi menggabungkan keduanya.
- Seed hanya 2 akun (Kas Toko, Bank Utama); tidak ada UI CRUD `finance_accounts` — penambahan akun lain butuh intervensi DB manual.

**Cara menjalankan/menguji**
- Buka `https://bj-stock.vercel.app/finance` sebagai admin; jalankan form opex, modal, payment, reversal, dan retur.
- Login sebagai teknisi dan pastikan `/finance` redirect ke `/scan` serta `POST /api/finance` mengembalikan 403.
- Jalankan `npm run test:db` (verifikasi: 5 unit + 3 part + koreksi upgrade net 0 + 4 penjualan + cicilan idempotent + servis + opex + modal + 2 retur; RLS teknisi ditolak), `npm run lint`, `npx tsc --noEmit`, `npm run build`.

**Status interface**
- [x] Ada interface — bisa direview di: `/finance` (deploy Vercel production 11 Juli 2026)
- [ ] Review interface manual tertunda: uji viewport 360px/390px dan semua alur form oleh Owner

**Yang belum selesai / diketahui rusak**
- Review interface manual Fase 5 belum dijalankan oleh Owner (verifikasi otomatis DB/lint/build sudah lulus).
- Tidak ada UI untuk CRUD `finance_accounts` (manajemen akun kas/bank/e-wallet).

**Rekomendasi mulai fase berikutnya dari mana**
- Mulai Fase 6 dari dashboard ringkasan (unit per status, servis aktif, garansi akan habis); semua data sumber sudah tersedia di tabel eksisting, tidak perlu migration baru.

---

## Patch Fase 2.1 — Garansi Dinamis — 11 Juli 2026

**Apa yang sudah dibangun**
- Migration `202607110004_dynamic_sales_warranty.sql` menambah snapshot `sales.durasi_garansi_hari` dan tabel `app_settings` beserta default unit/servis.
- Trigger F-WRT-01 menghitung tanggal akhir dari durasi milik transaksi, tanpa literal durasi di badan trigger aktif.
- Form Sales membaca `default_warranty_unit_days` dan admin dapat mengubah durasi sebelum konfirmasi.
- RPC Sales menerima dan memvalidasi durasi, lalu menyimpannya sebelum trigger garansi dijalankan.

**Keputusan teknis yang diambil**
- Ini mengoreksi keputusan Fase 2 tanggal 10 Juli 2026 yang menanam durasi 30 hari langsung di trigger.
- `app_settings` hanya menjadi default form; garansi yang sudah dibuat memakai snapshot transaksi dan tidak berubah saat setting global berubah.
- Dua lapisan RPC Sales lama diganti satu fungsi final agar penambahan parameter tidak menghasilkan wrapper ketiga.
- Margin tetap dihitung server-side dari `harga_jual - total_modal`; perubahan garansi tidak menyentuh alur uang.

**Cara menjalankan/menguji**
- Buka form Sales dan pastikan durasi terisi dari `app_settings`, lalu ubah nilainya sebelum konfirmasi.
- Jalankan `npm run test:db`, `npm run lint`, `npx tsc --noEmit`, dan `npm run build`.
- Bukti test: transaksi `2026-07-10` berdurasi 45 hari berakhir `2026-08-24`; transaksi `2026-01-01` berdurasi 14 hari berakhir `2026-01-15`.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada satu field tambahan pada form Sales; tidak memerlukan checkpoint review terpisah sesuai TODO.

**Yang belum selesai / diketahui rusak**
- Tidak ada untuk Patch 2.1.

**Rekomendasi mulai fase berikutnya dari mana**
- Mulai Fase 5 dari migration tabel Finance, RLS admin-only, dan seed akun default sebelum menghubungkan event operasional.

---

## Patch Fase 1.2 — Harga Listing pada Unit — 11 Juli 2026

**Apa yang sudah dibangun**
- Migration `202607110003_unit_listing_price.sql` menambah `units.harga_listing` dengan constraint nilai positif.
- Transisi `Ready → Listed` wajib menyertakan harga; RPC yang sama mendukung repricing selama unit masih `Listed`.
- Harga listing terkunci setelah unit `Terjual` dan ditampilkan pada detail unit.
- Form Sales memuat harga listing sebagai nilai awal harga jual, tetapi input tetap dapat diubah sebelum transaksi.

**Keputusan teknis yang diambil**
- Validasi status/harga ditempatkan di trigger database agar insert atau update langsung tidak dapat melewati aturan.
- `harga_listing` dan `sales.harga_jual` tetap kolom terpisah; trigger margin hanya membaca `harga_jual`.
- RPC status yang sudah ada diperluas untuk transisi dan repricing agar tidak menambah endpoint khusus.

**Cara menjalankan/menguji**
- Pada unit `Ready`, coba lanjut tanpa harga (ditolak), lalu isi harga dan lanjut ke `Listed`.
- Ubah harga pada detail unit `Listed`, kemudian buka **Jual unit** dan pastikan harga jual terisi nilai terbaru serta tetap editable.
- Jalankan `npm run test:db`, `npm run lint`, dan `npx tsc --noEmit`.
- Bukti test: tanpa harga ditolak; harga `4.200.000` berhasil; repricing `3.900.000` tersimpan.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada perubahan kecil pada detail unit dan form Sales; tidak memerlukan checkpoint review terpisah sesuai TODO.

**Yang belum selesai / diketahui rusak**
- Tidak ada untuk Patch 1.2.

**Rekomendasi mulai fase berikutnya dari mana**
- Lanjutkan Patch 2.1 dengan menghapus literal durasi garansi dari trigger Sales.

---

## Patch Fase 1.1 — Navigasi Responsif Mobile — 11 Juli 2026

**Apa yang sudah dibangun**
- Desktop `md+` memakai sidebar vertikal tetap; mobile memakai header, bottom tab maksimal lima item, dan drawer menu penuh.
- Menu difilter sebelum render: teknisi hanya melihat Scan, Unit/Upgrade, dan Servis; admin melihat seluruh modul operasional.
- Layout dashboard memakai `overflow-x-hidden` dan ruang bawah untuk bottom navigation.

**Verifikasi interface**
- Edge headless terautentikasi diuji pada viewport 360x800 dan 390x800.
- Viewport 360: `innerWidth=360`, `scrollWidth=360`, bottom nav 5 item, sidebar `display:none`.
- Viewport 390: `innerWidth=390`, `scrollWidth=390`, bottom nav 5 item, sidebar `display:none`.
- Screenshot memperlihatkan daftar unit tetap terbaca, bottom nav tidak melebar, dan drawer 390px menampilkan semua menu admin tanpa overflow.
- TypeScript, lint, build production, dan deployment Vercel lulus.

**Yang belum selesai / diketahui rusak**
- Review sentuhan pada perangkat fisik tetap disarankan, tetapi verifikasi layout 360/390 dan screenshot browser sudah lulus.

---

## Fase 4 — CRM — 11 Juli 2026

**Apa yang sudah dibangun**
- F-CRM-01: profil customer otomatis dari Sales/Servis dengan deduplikasi berdasarkan nomor WhatsApp kanonik.
- Endpoint `GET /api/customers?wa=` untuk lookup nomor WA tervalidasi.
- Daftar customer dengan pencarian nama/WA, segmen, sumber lead, serta jumlah pembelian dan servis.
- Halaman profil customer dengan timeline gabungan invoice pembelian dan order servis, terbaru lebih dulu.
- Daftar garansi unit yang berakhir dalam tujuh hari dengan aksi follow-up WhatsApp manual.
- Link ke profil customer dari invoice Sales dan detail Servis.

**Keputusan teknis yang diambil**
- Nomor `+628...`, `628...`, dan `08...` dinormalisasi menjadi format `628...` di validasi aplikasi dan trigger database.
- Collision WA pada Sales/Servis memakai profil existing tanpa mengubah nama, segmen, atau sumber lead lama.
- RPC lama dibungkus dengan kontrak identitas CRM baru; implementasi transaksi Sales/Servis dan perhitungan uang tidak diduplikasi.
- Pencarian dan agregasi CRM mengambil seluruh halaman data Supabase bertahap agar tidak terpotong batas 1.000 row.
- Reminder H-7 hanya membaca garansi unit aktif dan tidak mengirim WhatsApp otomatis.
- Tidak ada tabel, jurnal, atau transaksi Finance yang dibuat pada Fase 4.

**Cara menjalankan/menguji**
- Login lalu buka `/customers`; cari dengan nama, `628...`, atau sebagian nomor.
- Buka `/customers/[id]` dan cocokkan timeline dengan invoice di `/sales/[id]` serta order `/service/[id]`.
- Gunakan panel **Garansi habis dalam 7 hari** untuk membuka WhatsApp secara manual.
- Jalankan `npm run test:db`, `npm run lint`, dan `npm run build`.
- Bukti lokal/cloud: input `+628...`, `628...`, dan `08...` menghasilkan satu `id_customer`; nama profil pertama tidak ditimpa transaksi berikutnya.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada interface — review `/customers`, pencarian, panel H-7, dan `/customers/[id]`.

**Yang belum selesai / diketahui rusak**
- Belum ada form edit identitas customer; perubahan profil perlu task eksplisit agar memiliki validasi/audit yang jelas.
- Reminder tidak menyimpan status sudah dihubungi dan tidak mengirim pesan otomatis.
- Reminder Fase 4 hanya mencakup garansi unit, sesuai FSD; garansi servis tetap terlihat pada order servis.

**Rekomendasi mulai fase berikutnya dari mana**
- Review satu profil yang memiliki pembelian dan servis, lalu uji pencarian dengan variasi format WA.
- Setelah disetujui, Fase 5 dapat mulai dari migration Finance dan akun kas default; jangan membuat ulang event operasional yang sudah memiliki source ID.

---

## Fase 3 — Modul Servis — 11 Juli 2026

**Apa yang sudah dibangun**
- Migration `service_orders`/`service_part_log`, RLS read-only, RPC role-aware, dan trigger status/biaya/stok.
- F-SVC-01: penerimaan servis customer luar atau unit BJ Laptop via scan QR, customer CRM, estimasi selesai, dan garansi per order.
- ID `SVC-YYMM-URUT3`, QR tanda terima bertoken acak, serta scanner internal untuk QR unit maupun servis.
- F-SVC-02: workflow linear `Diterima → Diagnosa → Dikerjakan → Selesai → Diambil`; teknisi tidak dapat melakukan serah terima akhir.
- F-SVC-03: pemakaian part tunggal dari Bank Stock dengan snapshot biaya dan pengurangan stok atomik.
- F-SVC-04: total biaya server-side, nota print-friendly, tanggal pengambilan, dan garansi servis.
- F-SVC-05: halaman publik bertoken yang hanya menampilkan perangkat, status, estimasi, dan garansi servis.
- Servis unit bergaransi dapat membuat dan menautkan `warranty_claim` secara atomik oleh admin.
- Token warna dan penggunaan logo pada halaman Servis mengikuti `BRAND_GUIDE.md`.

**Keputusan teknis yang diambil**
- `total_biaya` adalah generated column; `biaya_part` selalu dihitung ulang dari log dan tidak dipercaya dari request.
- Trigger part mengunci order lalu part, menyimpan snapshot modal, dan hanya mengizinkan mutasi operasional ketika status `Dikerjakan`.
- `id_klaim` unik dan divalidasi harus berasal dari garansi milik `id_unit` yang sama; teknisi tidak dapat membuat cabang klaim.
- Customer existing berdasarkan WA digunakan ulang tanpa diubah oleh teknisi; customer baru dibuat di transaksi penerimaan servis.
- Slug publik berbentuk `SVC-YYMM-URUT3-[UUID]`; ID servis saja tidak cukup untuk lookup anonim.
- Tanggal bisnis Servis menggunakan `Asia/Jakarta`, bukan UTC Vercel/Supabase.
- Garansi servis disimpan pada order melalui `tanggal_diambil + garansi_servis_hari`; tidak memakai tabel `warranty` unit untuk customer luar.
- Tidak ada jurnal Finance pada status Servis atau pemakaian part; pembayaran belum menjadi bagian Fase 3.

**Cara menjalankan/menguji**
- Jalankan `npm run dev`, login admin/teknisi, lalu buka `/service`.
- Servis luar: `/service/new` → Diagnosa → Dikerjakan → tambah part → Selesai → admin Diambil → buka nota.
- Servis unit: `/scan?purpose=service`; untuk klaim aktif gunakan tombol **Buat order servis klaim** dari `/warranty?unit=...`.
- Scan QR tanda terima atau buka slug `/s/SVC-...-[token]` tanpa login untuk memeriksa tampilan customer.
- Jalankan `npm run test:db`, `npm run lint`, dan `npm run build`.
- Bukti lokal/cloud: jasa `300.000` + part `200.000` = total `500.000`; dua order memakai stok `2 → 0`; percobaan ketiga ditolak; klaim terhubung ke unit yang sama.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada interface — review `/service`, `/service/new`, `/service/[id]`, `/service/[id]/receipt`, scan QR, dan halaman publik `/s/[slug]`.

**Yang belum selesai / diketahui rusak**
- Kamera HP, hasil cetak nota fisik, dan tombol buka link publik perlu review manual pada perangkat Owner.
- Belum ada pencatatan pembayaran/lunas/piutang servis; itu sengaja ditunda ke Modul Finance Fase 5.
- Mutasi/hapus part servis tidak tersedia di UI setelah dipasang; koreksi operasional lanjutan perlu fitur audit eksplisit, bukan edit bebas.

**Rekomendasi mulai fase berikutnya dari mana**
- Review dua alur Servis di HP terlebih dahulu dan pastikan informasi publik cukup untuk customer.
- Setelah disetujui, Fase 4 mulai dari profil customer dan timeline gabungan Sales + Servis; jangan mulai Finance sebelum Fase 4 selesai.

---

## Fase 2 — Sales & Garansi — 10 Juli 2026

**Apa yang sudah dibangun**
- F-SLS-01: alur scan QR → validasi unit `Ready`/`Listed` → pilih/buat customer → transaksi penjualan.
- Invoice otomatis `INV-YYMM-URUT3`, daftar Sales dengan margin internal, dan halaman invoice print-friendly tanpa data modal.
- F-WRT-01: garansi unit 30 hari dibuat otomatis bersama transaksi.
- F-WRT-02: lookup garansi via scan/ID unit, status masa garansi, dan riwayat/form klaim admin.
- F-WRT-03: garansi lewat tanggal berakhir diubah menjadi `Habis` saat lookup; klaim kedaluwarsa tetap ditolak di database.

**Keputusan teknis yang diambil**
- `create_sale` adalah RPC `security definer` yang memverifikasi claim role admin, mengunci unit/customer, dan membentuk invoice dalam satu transaksi.
- Trigger `prepare_sale` mengambil snapshot `units.total_modal` untuk margin; trigger `complete_sale` menjadi satu-satunya jalur `Ready`/`Listed → Terjual` dan membuat garansi.
- ID invoice dikunci per bulan dengan `pg_advisory_xact_lock`; transaksi ganda unit yang sama ditolak unique constraint.
- Customer baru dibuat atau dicocokkan berdasarkan nomor WA di transaksi; halaman profil/riwayat CRM tetap dikerjakan pada Fase 4.
- Invoice memakai halaman print browser, bukan generator PDF terpisah.

**Cara menjalankan/menguji**
- Jalankan `npm run dev`, login sebagai admin, buka `/sales`, lalu scan unit `Ready`/`Listed` dan selesaikan transaksi.
- Buka `/sales/[id_invoice]` lalu klik **Cetak invoice**; data total modal/margin tidak masuk invoice customer.
- Buka `/warranty` atau `/scan?purpose=warranty`, cari unit terjual, lalu buat klaim saat status masih `Aktif`.
- Jalankan `npm run test:db`, `npm run lint`, dan `npm run build`.
- Bukti lokal/cloud: modal `2.500.000 + 250.000 = 2.750.000`; harga jual `4.000.000`; margin tersimpan `1.250.000`; garansi `2026-07-10 → 2026-08-09`.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada interface — review `/sales`, `/sales/[id]`, alur `/scan?purpose=sale`, `/warranty`, dan `/scan?purpose=warranty`.

**Yang belum selesai / diketahui rusak**
- Cetak invoice sudah print-friendly tetapi hasil printer fisik/PDF browser perlu dicek manual oleh Owner.
- Expiry garansi sengaja on-the-fly saat lookup; tidak ada scheduled job pada fase ini.
- Modul Servis dan pengaitan klaim garansi ke service order baru masuk Fase 3.

**Rekomendasi mulai fase berikutnya dari mana**
- Review satu transaksi dan satu klaim melalui browser/HP terlebih dahulu; setelah disetujui, mulai Fase 3 dari migration `service_orders` dan `service_part_log`.
- Pakai Bank Stock dan pola trigger/RPC yang sudah ada agar biaya part servis serta pengurangan stok tetap atomik.

---

## Fase 1 — Modul Stock & QR — 10 Juli 2026

**Apa yang sudah dibangun**
- F-STK-01: form/API tambah unit tervalidasi, upload maksimal empat foto, ID bulanan transactional, dan QR.
- Daftar unit responsif dengan filter brand/status serta halaman detail berisi foto, modal, QR, dan Upgrade Log.
- F-STK-02: status manual linear `Masuk → QC → Ready → Listed`, ditegakkan trigger database.
- F-STK-03: scan QR memakai kamera belakang dengan fallback pencarian ID manual.
- F-BNK-01: CRUD Bank Stock, ID part otomatis, dan restock non-negatif.
- F-UPG-01: pemasangan part/jasa, biaya part dari database, decrement/restock stok, dan recalculate `total_modal` otomatis.

**Keputusan teknis yang diambil**
- Counter ID unit bersifat global per bulan dan dikunci dengan `pg_advisory_xact_lock`.
- `qr_payload` disimpan sebagai `id_unit`; PNG QR dibuat dinamis agar tidak ada file QR duplikat.
- Biaya part Upgrade Log selalu mengambil `bank_stock.modal_per_unit`; biaya historis tidak berubah saat harga part diperbarui.
- Kolom `total_modal` dilindungi trigger dari edit langsung dan selalu dihitung `modal_awal + SUM(upgrade_log.biaya)`.
- Trigger stok memakai row lock dan menolak pemakaian saat stok nol; update/delete log mengembalikan stok secara konsisten.
- Upgrade serentak diserialkan lewat lock row unit; pergantian part mengunci part lama/baru secara terurut untuk mencegah stale total dan deadlock.
- Minimum password Supabase diselaraskan menjadi 8 karakter di konfigurasi lokal.
- `serial_number` sementara unik global mengikuti DDL `SPEC.md`; lihat pertanyaan terbuka di `TODO.md`.

**Cara menjalankan/menguji**
- Isi `.env.local` dari project Supabase, jalankan migration/seed, lalu `npm run dev`.
- Buka `/login`; akun perlu `app_metadata.role` bernilai `admin` atau `teknisi`.
- Production tersedia di `https://bj-stock.vercel.app`; akun review tersimpan sebagai `REVIEW_ADMIN_*` dan `REVIEW_TEKNISI_*` di `.env.local`.
- Jalankan `npm run test:db`, `npm run lint`, dan `npm run build`.
- Bukti hitung test: `2.500.000 + 250.000 + 250.000 + 150.000 = 3.150.000`; stok `5 → 4`, stok nol ditolak, dan cleanup kembali `4`.
- Review keamanan/API dan audit transaksi uang/stok dijalankan terpisah; tidak ada temuan high/medium tersisa setelah hardening.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada interface — review production di `https://bj-stock.vercel.app` untuk `/units`, `/units/new`, `/units/[id]`, `/scan`, dan `/bank-stock`.

**Yang belum selesai / diketahui rusak**
- Migration/seed cloud, login role admin/teknisi, proteksi route/API, dan Storage upload/delete sudah lulus smoke test; kamera HP masih perlu review manual.
- Race concurrency telah ditutup secara desain dan direview, tetapi uji multi-connection PostgreSQL tetap menunggu Supabase/Docker.
- Keunikan serial global vs. hanya unit aktif perlu keputusan Owner sebelum aturan registrasi ulang dibutuhkan.
- Advisory PostCSS dari dependency internal Next.js belum memiliki upgrade stabil non-breaking.

**Rekomendasi mulai fase berikutnya dari mana**
- Selesaikan review interface dan blocker cloud terlebih dahulu; jangan mulai Fase 2 sebelum approval.
- Saat Fase 2 dimulai, alur Sales harus menjadi satu-satunya jalur terpercaya yang mengizinkan `Ready`/`Listed → Terjual`; trigger status Fase 1 saat ini sengaja menolak transisi tersebut.

---

## Fase 0 — Setup Project — 10 Juli 2026

**Apa yang sudah dibangun**
- Repository git dan `.gitignore` aman untuk environment/build output.
- Next.js 16 App Router, TypeScript strict, Tailwind CSS, dan ESLint.
- Supabase CLI/SDK, konfigurasi lokal, `.env.example`, migration awal, dan seed.
- Supabase Auth berbasis `app_metadata.role` dengan role `admin`/`teknisi`, RLS, dan halaman `/login`.
- Supabase Cloud terhubung dan skeleton production tersedia di `https://bj-stock.vercel.app`.

**Keputusan teknis yang diambil**
- `total_modal` berupa kolom `numeric` yang diisi trigger, bukan generated column, agar dapat direcalculate dari Upgrade Log.
- Migration diuji dengan PGlite karena Docker tidak tersedia; file migration tetap kompatibel PostgreSQL/Supabase.
- Role disimpan di `raw_app_meta_data`, bukan metadata yang dapat diubah user.

**Cara menjalankan/menguji**
- Salin nilai Supabase ke `.env.local`, lalu jalankan `npm run dev` dan buka `http://localhost:3000/login`.
- Jalankan `npm run test:db`, `npm run lint`, dan `npm run build`.
- Pipeline Vercel production berhasil membangun Next.js 16 dan seluruh route.

**Status interface**
- [ ] Backend-only (belum ada yang bisa direview manusia)
- [x] Ada interface — bisa direview di: `/login` (belum checkpoint UI operasional)

**Yang belum selesai / diketahui rusak**
- Tidak ada pekerjaan setup cloud yang tertunda.
- `npm audit` melaporkan advisory PostCSS dari dependency internal Next.js; belum ada patch stabil non-breaking.

**Rekomendasi mulai fase berikutnya dari mana**
- Implement F-STK-01 mulai dari generator ID transactional dan API tambah unit; deploy cloud dapat diselesaikan paralel setelah kredensial tersedia.

## Hotfix — Fix Resale Constraint — 20 July 2026

**Root cause**: UNIQUE constraint pada sales.id_unit mencegah unit yang sudah dijual (lalu di-cancel/diretur) untuk dijual ulang, karena cancel_sale() hanya mengubah status row menjadi Dibatalkan tanpa menghapusnya.

**Fix**: Ganti UNIQUE constraint dengan partial unique index:
- Hapus constraint sales_id_unit_key (unconditional unique)
- Buat index sales_id_unit_active_unique — unique hanya untuk status IS DISTINCT FROM 'Dibatalkan'

Sehingga unit bisa dijual ulang setelah cancel/return selama tidak memiliki penjualan aktif.

**File**: supabase/migrations/202607200001_fix_resale_constraint.sql
**Status**: ✅ Production
