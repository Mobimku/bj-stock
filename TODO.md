# TODO.md — Checklist Eksekusi Bertahap
## BJ Stock

Update file ini setiap task selesai. Status: `[ ]` belum, `[~]` sedang dikerjakan, `[x]` selesai.
Setiap task selesai wajib memenuhi Definition of Done di `SPEC.md` § 7.

**Catatan estimasi**: fase di bawah diukur pakai jumlah task, bukan hari/minggu — estimasi kalender tidak relevan untuk kecepatan kerja AI agent.

**Catatan mode operasi**: dua jenis penanda dipakai di akhir tiap fase —
- 🤖 **Self-verify** — agent cek sendiri ke `SPEC.md`/`FSD.md` (seed data, kalkulasi, constraint) lalu **lanjut otomatis** ke fase berikutnya tanpa menunggu manusia. Dipakai untuk fase yang belum menghasilkan interface.
- 👤 **Review interface** — fase ini sudah menghasilkan UI yang bisa dibuka & diklik; agent berhenti di sini, manusia baru masuk untuk mengetes langsung.

Setiap fase juga wajib diakhiri dengan task **update `HANDOFF.md`** (lihat `AGENTS.md` § 10) sebelum ditandai selesai.

---

## Fase 0 — Setup Project (7 task · 🤖 self-verify)

- [x] Init repo git + `.gitignore` (termasuk `.env`)
- [x] Scaffold Next.js + TypeScript + Tailwind
- [x] Setup project Supabase, simpan credential di `.env.example`
- [x] Buat migration awal: tabel `units`, `bank_stock`, `upgrade_log`, `customers` (sesuai `SPEC.md` § 3)
- [x] Setup Supabase Auth (role `admin`, `teknisi`)
- [x] Deploy skeleton kosong ke Vercel (pastikan pipeline jalan sebelum nambah fitur)
- [x] Buat `HANDOFF.md` awal (struktur sesuai `AGENTS.md` § 10)

🤖 **Self-verify**: belum ada interface untuk direview manusia (skeleton kosong) — agent cek pipeline build/deploy jalan, lalu lanjut otomatis ke Fase 1.

## Fase 1 — Modul Stock & QR (12 task · 👤 review interface)

- [x] F-STK-01: Form tambah unit baru + validasi
- [x] Generate `id_unit` otomatis (logika counter per bulan, lihat `SPEC.md` § 4)
- [x] Generate & simpan QR code (`qr_payload` = `id_unit`) saat unit dibuat
- [x] Halaman daftar unit (list + filter by brand/status)
- [x] Halaman detail unit
- [x] F-STK-02: Update status unit (transisi linear, sesuai `AGENTS.md` § 3)
- [x] F-STK-03: Halaman scan QR (kamera) → redirect ke detail unit
- [x] Modul Bank Stock: CRUD part
- [x] F-UPG-01: Tambah upgrade log dari halaman detail unit
- [x] Trigger: recalculate `total_modal` otomatis (verifikasi dengan seed data)
- [x] Trigger: decrement `bank_stock.stock_qty` saat part dipakai
- [x] Update `HANDOFF.md` — entri Fase 1

👤 **Review interface**: fase ini menghasilkan UI pertama (daftar/detail unit, scan QR) — berhenti di sini, tunggu review manusia sebelum lanjut ke Fase 2.

### Fase 1.1 — Patch: Navigasi Responsif Mobile (4 task · 👤 review interface)

**Konteks**: hasil review Fase 1 menunjukkan nav bar memanjang dan menu tidak terlihat di perangkat seluler. Root cause: `SPEC.md` sebelumnya tidak pernah mendefinisikan pola navigasi untuk mobile secara eksplisit (celah spec, bukan cuma bug implementasi) — sudah ditambahkan di `SPEC.md` §2.1 "Pola Navigasi Responsif". Patch ini menerapkan pola tersebut.

- [x] Refactor nav jadi 2 komponen terpisah: `AppSidebar` (≥768px) dan `MobileNav` + `MobileDrawer` (<768px), sesuai `SPEC.md` §2.1 — bukan satu komponen nav yang "menyempit"
- [x] Terapkan filter item menu per role (Admin/Teknisi) di kedua komponen, konsisten dengan yang sudah berlaku di sidebar desktop
- [x] Pastikan container nav `overflow-x-hidden` di semua breakpoint — tidak ada elemen yang memicu scroll horizontal
- [x] Update `HANDOFF.md` — entri patch (sertakan screenshot/deskripsi hasil di viewport 360px & 390px)

👤 **Review interface**: ini bug tampilan, wajib dicek visual langsung oleh manusia di perangkat seluler asli atau devtools mobile emulation pada lebar 360px dan 390px — jangan ditandai selesai hanya dari kode tanpa screenshot/cek visual.

### Fase 1.2 — Patch: Harga Listing pada Unit (4 task · 🤖 self-verify)

**Konteks**: unit berstatus `Listed` sebelumnya tidak punya tempat menyimpan harga yang dipasang di konten/marketplace — satu-satunya field harga (`sales.harga_jual`) baru terisi saat transaksi closing (F-SLS-01), bukan saat unit di-listing. Ini gap data, bukan bug — sudah ditambahkan `units.harga_listing` di `SPEC.md` §3 dan alurnya di `FSD.md` F-STK-02/F-SLS-01.

- [x] Migration: tambah kolom `units.harga_listing numeric check (harga_listing > 0)`
- [x] Validasi F-STK-02: tolak transisi status ke `Listed` kalau `harga_listing` kosong; izinkan admin mengedit `harga_listing` selama status masih `Listed` (repricing)
- [x] Form transaksi jual (F-SLS-01): prefill field harga jual dari `units.harga_listing`, tetap bisa diubah manual sebelum konfirmasi — pastikan `margin` tetap dihitung dari `harga_jual`, bukan `harga_listing`
- [x] Update `HANDOFF.md` — entri patch

🤖 **Self-verify**: satu kolom + satu validasi + satu prefill di form yang sudah ada — agent verifikasi dengan seed data (coba set status `Listed` tanpa harga → harus ditolak; set dengan harga → sukses; buka form jual → pastikan harga jual ter-prefill benar dari `harga_listing` tapi tetap bisa diubah), lalu lanjut otomatis tanpa menunggu review manusia.

## Fase 2 — Sales & Garansi (9 task · 👤 review interface)

- [x] F-SLS-01: Form transaksi jual (trigger dari scan QR unit)
- [x] Validasi: hanya unit status `Ready`/`Listed` bisa dijual
- [x] Generate `id_invoice` otomatis
- [x] Trigger: hitung `margin`, update status unit → `Terjual`
- [x] F-WRT-01: Auto-generate record garansi saat transaksi sukses
- [x] F-WRT-02: Halaman klaim garansi (scan QR unit → lihat status garansi → input klaim)
- [x] F-WRT-03: Logic auto-expire garansi (on-the-fly check saat lookup, atau scheduled job)
- [x] Cetak/tampilkan invoice sederhana (PDF atau halaman print-friendly)
- [x] Update `HANDOFF.md` — entri Fase 2

👤 **Review interface**: fase ini menghasilkan alur transaksi & invoice yang bisa dites langsung — berhenti di sini untuk review manusia sebelum lanjut ke Fase 3 (Servis berbagi Bank Stock dengan alur upgrade, pastikan konsisten dulu).

### Fase 2.1 — Patch: Garansi Dinamis (bukan hardcode) (3 task · 🤖 self-verify)

**Konteks**: implementasi F-WRT-01 saat ini menghitung `tanggal_berakhir` pakai durasi 30 hari yang ditulis literal di trigger (lihat entri `HANDOFF.md` Fase 2 untuk detail). Ini melanggar prinsip BR-01/BR-06 (nilai bisnis tidak boleh nempel di kode, harus bisa dikonfigurasi tanpa migration ulang) dan menyamakan pola dengan `service_orders.garansi_servis_hari` yang sudah benar sejak awal (kolom per-baris, bukan hardcode).

- [x] Migration: tambah kolom `sales.durasi_garansi_hari integer not null default 30`, tambah tabel `app_settings` (lihat `SPEC.md` §3, blok "APP SETTINGS")
- [x] Ubah trigger F-WRT-01: `tanggal_berakhir = tanggal_mulai + sales.durasi_garansi_hari`, hapus literal `+ 30` dari badan trigger
- [x] Ubah form transaksi jual: tambah field durasi garansi, prefill dari `app_settings.default_warranty_unit_days`, admin bisa override sebelum konfirmasi
- [x] Update `HANDOFF.md` — entri patch (catat bahwa ini koreksi atas keputusan teknis 2026-07-10 di Fase 2, sertakan alasan)

🤖 **Self-verify**: backend/trigger-only patch + satu field tambahan di form yang sudah ada — agent verifikasi dengan seed data (buat 2 transaksi jual dengan durasi garansi berbeda, pastikan `tanggal_berakhir` masing-masing benar), lalu lanjut otomatis. Tidak perlu menunggu review manusia untuk patch sekecil ini, kecuali agent menemukan trigger F-WRT-01 dipakai di tempat lain yang berasumsi durasi tetap 30 hari — dalam hal itu berhenti dan laporkan.

## Fase 3 — Modul Servis (10 task · 👤 review interface)

- [x] Migration: tabel `service_orders`, `service_part_log`
- [x] F-SVC-01: Form terima order servis — dua sub-alur (unit sendiri via scan QR / servis umum input manual)
- [x] Generate `id_servis` + QR tanda terima
- [x] F-SVC-02: Update status servis (Diterima → Diagnosa → Dikerjakan), input diagnosa & tindakan
- [x] F-SVC-03: Tambah part terpakai dari Bank Stock ke servis, trigger hitung `biaya_part`
- [x] F-SVC-04: Penyelesaian servis (Selesai → Diambil), generate nota, mulai garansi servis
- [x] F-SVC-05: Halaman publik `/s/[id_servis]` — cek status read-only tanpa login
- [x] Uji alur end-to-end: servis umum customer luar (tanpa `id_unit`)
- [x] Uji alur end-to-end: servis atas unit sendiri dalam masa garansi (terhubung ke F-WRT-02)
- [x] Update `HANDOFF.md` — entri Fase 3

👤 **Review interface**: fase ini menghasilkan form servis, tracking status, dan halaman publik `/s/[id_servis]` — berhenti di sini, cek kedua sub-alur (unit sendiri vs. customer luar) tidak saling tabrakan datanya.

## Fase 4 — CRM (5 task · 👤 review interface)

- [x] F-CRM-01: Auto-create profil customer saat transaksi pertama (dicek by nomor WA)
- [x] Halaman profil customer: riwayat gabungan (pembelian + servis), terurut tanggal
- [x] Pencarian customer by nama/WA
- [x] (Should-have) Daftar customer dengan garansi akan habis dalam 7 hari (untuk follow-up manual, bukan auto-blast)
- [x] Update `HANDOFF.md` — entri Fase 4

👤 **Review interface**: halaman profil customer bisa dicek langsung.

## Fase 5 — Finance (13 task · 👤 review interface)

- [x] Migration: `finance_accounts`, `finance_transactions`, `receivables`, `finance_payments`, `returns`, dan event restock Bank Stock (lihat `SPEC.md` §3.1, termasuk kategori `Modal Disetor`/`Retur Unit`/`Retur Servis`)
- [x] Migration: RLS policy eksplisit — role `teknisi` tidak boleh SELECT/INSERT/UPDATE/DELETE ke `finance_accounts`, `finance_transactions`, `receivables`, `finance_payments`, `returns` (F-FIN, `FSD.md` §2.7 "Aturan akses")
- [x] Seed akun default: Kas Toko dan Bank Utama
- [x] F-FIN-01: integrasi otomatis pembelian unit ke kas keluar, idempotent
- [x] F-FIN-01: integrasi restock Bank Stock dan biaya upgrade eksternal
- [x] F-FIN-03: integrasi Sales Tunai/Transfer serta Cicilan/piutang
- [x] F-FIN-03: integrasi pembayaran Servis
- [x] F-FIN-02: form biaya operasional manual dan transaksi reversal
- [x] F-FIN-05: form Modal Disetor manual
- [x] F-FIN-06: alur Retur Unit/Servis (atomik: `returns` + kembalikan status unit + tutup warranty + entri finance)
- [x] F-FIN-04: halaman arus kas, piutang, dan laba rugi sederhana
- [x] Uji akses: login sebagai `teknisi`, pastikan semua endpoint/halaman Finance menolak akses (bukan cuma disembunyikan di UI)
- [x] Update `HANDOFF.md` — entri Fase 5 Finance

👤 **Review interface**: cek satu pembelian unit, satu restock part, satu penjualan tunai, satu cicilan, satu pembayaran servis, satu biaya operasional, satu Modal Disetor, dan satu Retur; pastikan setiap event hanya muncul sekali dan akun `teknisi` benar-benar ditolak dari semua endpoint Finance.



## Fase 6 — Dashboard & Laporan (5 task · 👤 review interface)

- [x] Ringkasan: jumlah unit per status, servis aktif, garansi akan habis
- [x] Laporan margin per brand/periode
- [x] Laporan kecepatan perputaran stock (rata-rata hari Masuk → Terjual)
- [x] Laporan distribusi sumber lead vs konversi
- [x] Update `HANDOFF.md` — entri Fase 6

👤 **Review interface**: dashboard bisa dicek langsung terhadap data seed.

## Fase 7 — Polish & Hardening (6 task · 👤 review interface, sign-off akhir)

- [x] Review keamanan: pastikan `SUPABASE_SERVICE_ROLE_KEY` tidak pernah dipakai di client
- [x] Review semua trigger perhitungan uang dengan data edge-case (mis. part harga 0, diskon, retur)
- [x] Uji responsif di HP (karena admin pakai kamera HP untuk scan QR)
- [x] Backup/export data sederhana (CSV) untuk semua tabel utama
- [x] Dokumentasi singkat cara pakai untuk admin/teknisi (bukan dokumen teknis, tapi panduan operasional)
- [x] Update `HANDOFF.md` — entri Fase 7 (final)

👤 **Review interface**: sign-off akhir sebelum sistem dipakai buat transaksi riil (bukan lagi data seed/dummy).

## Fase 7.5 — Unit Delisting & Edit (8 task · 👤 review interface)

**Konteks**: feedback Owner — unit yang sudah di-input tidak bisa diedit atau dihapus. Di dunia nyata, unit bisa rusak parah, dikembalikan ke supplier, salah input, atau hilang. Status `Delisted` ditambahkan agar unit bisa dikeluarkan dari stok aktif tanpa menghapus data (menjaga integritas finance). Lihat `FSD.md` F-STK-04.

- [x] Migration: tambah status `Delisted` ke CHECK constraint tabel `units`, tambah kolom `delist_alasan text` dan `delist_jenis text` (check in `rusak`, `retur_supplier`, `salah_input`, `hilang`), tambah `delist_tanggal date`
- [x] RPC `delist_unit(p_id_unit, p_alasan, p_jenis)`: validasi status `Ready`/`Listed`, ubah status ke `Delisted`, catat alasan/jenis/tanggal; jika jenis `retur_supplier` atau `salah_input` → reversal finance (semua transaksi `Pembelian Unit` dan `Biaya Upgrade Eksternal` terkait unit). Jika `salah_input` → hard delete row unit + upgrade_log + foto (dengan konfirmasi).
- [x] RPC `reactivate_unit(p_id_unit)`: validasi status `Delisted`, ubah ke `Ready`; jika sebelumnya ada reversal finance (retur_supplier/salah_input), buat transaksi `Pembelian Unit` baru sebesar `total_modal` saat ini
- [x] API route `POST /api/units/[id]/delist` dan `POST /api/units/[id]/reactivate` (admin-only)
- [x] UI: tombol "Delist unit" di halaman detail unit (hanya muncul saat status `Ready`/`Listed`), form pilih alasan + jenis, konfirmasi ganda untuk `salah_input`
- [x] UI: tombol "Reactivate" di halaman detail unit `Delisted`
- [x] UI: halaman detail unit `Delisted` menampilkan badge status + alasan + tanggal delist; tidak menampilkan tombol status/jual
- [x] Update `HANDOFF.md` — entri Fase 7.5

👤 **Review interface**: cek satu unit delist (retur supplier dengan reversal finance), satu unit delist (rusak tanpa reversal), satu reactivate; pastikan finance konsisten.

### Fase 7.6 — Patch: Photo Upload via Signed URL (5 task · 🤖 self-verify)

**Konteks**: produksi Vercel mengkorupsi upload foto binary (file `image/webp` tersimpan dengan byte `ef bf bd` di header RIFF, jadi file rusak tak bisa didecode). Penyebab: Vercel serverless `fetch`/body handler tidak mempertahankan byte binary saat diteruskan ke Supabase Storage `upload()` via server-side client. Di mesin lokal (Node 22, Windows) tidak terjadi — masalah khusus runtime Vercel Node 20. Solusi: alihkan pipeline upload ke **signed URL flow** — server hanya generate signed upload URL, client browser `PUT` langsung ke Supabase Storage, melewati serverless binary handling.

- [x] Hapus pipeline `sharp` + `supabase.storage.upload()` dari `POST /api/units` (unit creation) dan `POST /api/units/[id]/photos` (add photo). Drop dependency `sharp` dari dua route ini.
- [x] `POST /api/units` menerima JSON body (bukan FormData); foto unit tidak lagi diupload saat create — admin redirect ke halaman detail unit lalu tambah foto via `PhotoUploadForm`.
- [x] `POST /api/units/[id]/photos` generate signed upload URLs (1 per foto, max 4 total, prefix path `${id_unit}/${uuid}.<ext>`), return `{ uploads: [{ signedUrl, path, token }] }`.
- [x] `PUT /api/units/[id]/photos` commit uploaded paths ke `foto_url` setelah memvalidasi prefix path dan total ≤4.
- [x] `DELETE /api/units/[id]/photos` preserved — hapus file Storage dan update `foto_url`.
- [x] `PhotoUploadForm` client: file → validasi size/type lokal (≤5MB, JPG/PNG/WebP) → POST dapat signed URLs → PUT langsung ke Storage → PUT commit ke API → refresh.
- [x] Verifikasi end-to-end lokal via script: login admin → POST /api/units (201) → POST photos dapat signed URL → upload via signed URL (RIFF valid, 0 U+FFFD) → PUT commit (foto_url=1) → DELETE (remaining=0) → 4-slot limit ditolak dengan 400.
- [x] Build & lint lulus.
- [x] Update `HANDOFF.md` — entri patch (catat root cause Vercel binary corruption + signed URL fix).

🤖 **Self-verify**: backend behavioral patch + UI flow yang sama dengan sebelumnya — agent verifikasi signed URL flow secara end-to-end lokal (RIFF valid, 0 U+FFFD, slot limit bekerja), lalu lanjut otomatis. Review manusia baru relevan ketika sudah deploy ke Vercel untuk pastikan binary corruption benar-benar hilang di production runtime.

### Fase 7.7 — Patch: Galeri Foto, Lightbox & Mobile-Friendly Delete (8 task · 👤 review interface)

**Konteks**: hasil riset galeri foto setelah Fase 7.6 menemukan 3 gap behaviour: (1) tidak ada lightbox/preview besar (admin cuma lihat thumb 4:3 kecil, detail foto tidak terungsisi); (2) tombol hapus foto cuma `group-hover:opacity-100` — tidak bisa di-tap di HP (no hover on touchscreen), admin tidak bisa hapus foto dari mobile; (3) foto di-render pakai native `<img>`, tidak ada optimasi. Selain itu, branch inline `<section>` non-admin di `page.tsx` duplikat logika yang sudah ada di `PhotoGallery`. Patch ini: gabung admin/non-admin ke satu komponen `PhotoGallery` (prop `canDelete`), tambah lightbox native `<dialog>` + navigasi keyboard, aktifkan delete always-visible di mobile, migrasi ke `next/image` dengan whitelist Supabase domain.

- [x] Riset lightbox: native `<dialog>` + scroll lock, ukuran viewport optimal (max 92vw × 86vh, `object-contain` tidak crop), navigasi prev/next (button + keyboard ←/→ + Esc), klik backdrop tutup.
- [x] Riset HP-friendly delete: tombol hapus selalu visible di mobile (`opacity-100` di < 640px), `sm:opacity-0 sm:group-hover:opacity-100` di desktop — bukan `long-press` pattern (terlalu janggal untuk konteks admin gallery).
- [x] `next.config.ts`: tambah `images.remotePatterns` untuk host Supabase (`${NEXT_PUBLIC_SUPABASE_URL}` di-parse pakai `new URL().host`), pathname `/storage/v1/object/public/unit-photos/**`.
- [x] `PhotoGallery` (`photo-gallery.tsx`) rewrite: prop `canDelete` untuk gating tombol hapus (admin vs teknisi). Lightbox pakai `<dialog>` + `showModal()`/`close()` di `useEffect` sinkron dengan state `lightboxIndex`. Thumb pakai `next/Image` `width=400 height=300 sizes="(max-width: 640px) 50vw, 33vw"` `unoptimized` (file asli dari Supabase public URL, tidak ada Image Transformation API di Free plan). Lightbox image `width=1600 height=1200 quality=90 unoptimized`. Tombol hapus `size-7` `bg-red-600`, kelas `sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100` — HP selalu visible.
- [x] `page.tsx`: hapus inline `<section>` non-admin (duplikat `PhotoGallery`), panggil `PhotoGallery` dengan `canDelete={role === "admin"}` di kedua path. Hapus `eslint-disable @next/next/no-img-element` yang sebelumnya di-inline (sekarang pakai `next/image`). `eslint-disable` untuk `<img>` QR di `/api/units/[id]/qr` tetap dipertahankan (route generasi PNG on-the-fly, bukan remote image).
- [x] Update `SPEC.md` §3.2 (Storage Supabase & Foto Unit) + §5 API route table (POST/PUT/DELETE `/api/units/[id]/photos`).
- [x] Update `FSD.md` F-STK-01 (foto dipisah dari create) + F-STK-05 baru (Galeri Foto Unit & Lightbox) dengan alur upload, tampilan, lightbox, hapus.
- [x] Build & lint lulus (0 errors 0 warnings).

👤 **Review interface**: lightbox, navigasi keyboard, dan tombol hapus HP-friendly wajib dicoba langsung di browser HP (viewport 360px/390px) atau devtools mobile emulation — klik thumb → pastikan dialog buka, ←/→/Esc bekerja, klik backdrop tutup, tombol prev/next ambil semua foto. Tombol hapus di thumb harus selalu visible di mobile tanpa hover. Login sebagai teknisi → pastikan tombol hapus tidak ada, lightbox tetap bisa dibuka.

---

### Fase 7.8 — Patch: Edit Spek via Modal, Riwayat Perubahan & Stricter Delisting (12 task · 👤 review interface)

**Konteks**: hasil Fase 7.5/7.6 biar unit bisa delist tapi ada 3 gap: (1) form edit full-detail (`edit-form.tsx`) berbahaya — admin bisa edit `modal_awal`/`brand`/`sumber_beli` yang seharusnya immutable setelah create, melanggar audit integritas; (2) tidak ada audit trail untuk spek yang berubah seiring waktu (RAM terpasang ulang, kondisi fisik turun, catatan service); (3) delist `salah_input` hard delete bisa menyebabkan orphan service_order yang FK-nya merujuk unit dihapus. Patch ini: kurangi field edit hanya ke `spek_saat_ini`/`kondisi_fisik`/`kondisi_fungsi` (opsi B per diskusi user — keep `spek_awal` frozen + history table baru), tambah `unit_spec_history` table + trigger auto-snapshot, dan tambah cek service order aktif di RPC `delist_unit`. Form di-render di dalam native `<dialog>` modal (klik tombol primary), bukan inline `<details>`.

- [x] Migration `202607120009_unit_spec_history_stricter_delist.sql`: `CREATE TABLE unit_spec_history` (RLS, grant `authenticated` select/insert, indexes `idx_unit_spec_history_id_unit_changed_at`), trigger `snapshot_unit_spec()` `AFTER INSERT` (catatan "Spek awal saat unit dibuat") + `AFTER UPDATE OF spek_saat_ini, kondisi_fisik, kondisi_fungsi` (pakai `IS DISTINCT FROM` untuk handle NULL). Backfill semua unit eksisting ke history row pertama. Update RPC `delist_unit` tambah cek `active_service_count` dari `service_orders WHERE status IN ('Diterima','Diagnosa','Dikerjakan')` — raise exception bila > 0.
- [x] Apply migration ke Supabase production via Management API. Verifikasi: 2 history rows (backfill), 0 units tanpa history, 2 triggers aktif, `has_stricter_check=true`.
- [x] `lib/validation/unit.ts`: tambah `specHistorySchema` (zod array of `id_history`/`id_unit`/`spek_saat_ini`/`kondisi_fisik`/`kondisi_fungsi`/`changed_by`/`changed_at`/`catatan`).
- [x] `PATCH /api/units/[id]` route: `editSchema` zod hanya `spek_saat_ini`/`kondisi_fisik`/`kondisi_fungsi` (opsional, pick yang ada). Field lain (brand/model/serial/sumber_beli/spek_awal/modal_awal/tanggal_masuk) → 400 "Field X tidak dapat diubah setelah create". Update Supabase, return `unitDetailSchema` seperti GET.
- [x] `edit-form.tsx` rewrite: `<dialog>` modal controlled by `open`/`onClose` props. Tiga field: textarea `spek_saat_ini`, select A/B/C `kondisi_fisik`, input teks `kondisi_fungsi`. Pre-fill dari unit data. Cancel + Save buttons. Fetch `PATCH /api/units/[id]`, `router.refresh()`, tutup modal. Error inline.
- [x] `edit-spec-button.tsx` (new): client wrapper component. Tombol "Edit spek & kondisi" (outline amber, `size-7` icon) → toggle `open` state → render `<EditUnitForm open={open} onClose=... unit={unit} />`.
- [x] `spec-history.tsx` (new): server component render timeline `<ol>` dari `unit_spec_history` (sort `changed_at desc`). Badge "Terbaru" untuk index 0, badge "Spek awal" untuk entry paling bawah atau `catatan` "Spek awal saat unit dibuat". Tampilkan `changed_at` (Indonesia locale), `changed_by`, `catatan`, dan diff ketiga field dengan placeholder "-" bila null.
- [x] `delist-form.tsx` rewrite: split jadi `DelistButton` (primary outline-red button, buka `<dialog>` modal dengan pilih jenis delist 4 skenario + alasan textarea, konfirmasi ganda untuk `salah_input`) dan `ReactivateButton` (preserved). Modal error inline.
- [x] `page.tsx` rewrite: import `EditSpecButton`/`DelistButton`/`SpecHistory`. `Promise.all` fetch unit + upgrade + service + warranty + spec history. Section "Spek & Kondisi" dengan heading + EditSpecButton + current spec grid + expandable `<details>` "Riwayat perubahan spesifikasi" rendering `<SpecHistory list={history} />`. DelistButton di action row alongside Jual/Terima Servis. Hapus `Detail` helper function (sekarang unused setelah rewrite — grid inline dipakai langsung).
- [x] Update `SPEC.md` §3 trigger list (6+7 baru untuk spec history), §3.3 baru "Riwayat Spesifikasi Unit (`unit_spec_history`)", §3.4 baru "Stricter Delisting", §5 API table `PATCH /api/units/[id]` + catatan stricter delist.
- [x] Update `FSD.md` F-STK-04 (tambah tombol delist UI + stricter block) + F-STK-06 baru "Edit Spek & Kondisi + Riwayat Perubahan" dengan alur edit, tampilan timeline, permission.
- [x] Build & lint pass lokal (0 errors 0 warnings, tsc --noEmit clean).
- [x] Deploy ke Vercel production.

👤 **Review interface**:
1. Login admin → buka `/units/[id]` → klik "Edit spek & kondisi" → modal muncul dengan 3 field pre-filled → edit salah satu → Save → halaman refresh, current spec update, "Riwayat perubahan spesifikasi" expandable menampilkan entry baru di atas dengan badge "Terbaru".
2. Coba kirim `PATCH` dengan field `brand` lewat curl/postman → harus 400 dengan pesan "Field brand tidak dapat diubah setelah create".
3. Coba delist unit yang punya service order status `Diterima`/`Diagnosa`/`Dikerjakan` → modal error muncul "Unit tidak dapat delist karena masih ada N service order aktif". Lalu selesaikan service order (put status `Diambil`) → delist berhasil.
4. Mobile viewport 360px/390px: modal edit spek tidak overflow, scroll lock saat modal terbuka, tombol Save/Cancel reachable. Timeline riwayat readable di mobile (vertical stack).


---

### Fase 7.9 — Patch: Layout Dashboard Scroll Independen & Sidebar Tetap (5 task · 👤 review interface desktop)

**Konteks**: di desktop, saat halaman dashboard panjang (mis. `/units` dengan banyak unit, `/units/[id]` dengan spec history), seluruh window menggulir — sidebar ikut tergeser (sticky bekerja parsial tapi konten utama tidak scroll mandiri), footer akun/logout tidak tetap di bawah. Owner minta: sidebar tetap di tempat, konten utama scroll vertikal independen, footer akun + tombol logout tetap di bagian bawah sidebar pakai flex-column + `margin-top: auto`.

- [x] Audit layout existing: outer `min-h-screen overflow-x-hidden md:grid md:grid-cols-[256px_1fr]`, sidebar `sticky top-0 h-screen overflow-y-auto md:flex md:flex-col`, content `<div className="min-w-0 overflow-x-hidden pb-20 md:pb-0">` (tidak ada height/explicit overflow-y), body `min-height: 100vh; margin: 0` (tidak lock overflow). Root cause: tidak ada height eksplisit di outer container → body jadi scroll container (seluruh window scroll) bukan content area.
- [x] Identifikasi style bentrok: (1) outer `min-h-screen` bukan `h-screen` → tidak lock viewport, konten push outer lebih tinggi dari viewport; (2) sidebar `sticky top-0` bekerja parsial — tampil fixed tapi memakai window sebagai scroll container, footer akun tidak dijamin di bawah walau nav items pendek; (3) content `<div>` tidak ada `overflow-y-auto` → ikut body scroll; (4) body `min-height: 100vh` tanpa lock overflow → window scroll.
- [x] Terapkan fix:
  - `app/(dashboard)/layout.tsx` outer: ganti `min-h-screen ... md:grid md:grid-cols-[...]` → `flex min-h-screen flex-col md:h-screen md:flex-row` (mobile column, desktop row tinggi viewport/viewbox). Hapus `md:grid` (grid tidak perlu, flex-row lebih sederhana dan konsisten dengan mobile).
  - content div: tambah `min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-0` → `min-h-0` agar flex item tidak auto-grow ke konten (penting untuk overflow-y-auto bekerja di flexrow).
  - `components/nav/app-sidebar.tsx` aside: hapus `sticky top-0` (tidak perlu lagi, parent height locked), pertahankan `hidden h-screen w-64 shrink-0 md:flex md:flex-col md:h-screen`. Ganti footer div `border-t` → `mt-auto border-t` (flex-column + `margin-top: auto` → footer selalu di bawah walau nav pendek).
  - `app/globals.css`: tambah `html, body { height: 100% }` + `body { overflow: hidden }` (window tidak scroll, hanya content area).
- [x] Build, lint, deploy Vercel production (`https://bj-stock-q1eg8r4g2-mobimku-1297s-projects.vercel.app` · aliased `https://bj-stock.vercel.app` · 52s). Verifikasi route `/units`, `/finance`, `/service`, `/customers`, `/warranty` semua 200 OK.

👤 **Review interface desktop**: buka `https://bj-stock.vercel.app` di desktop viewport (≥768px) → login admin → buka halaman dengan konten panjang (mis. `/units` bila ada banyak unit, atau `/units/BJ-ASUS-2607-002`) → pastikan: (1) sidebar tetap di tempat, tidak ikut scroll; (2) konten utama scroll vertikal mandiri; (3) footer akun + tombol Keluar tetap di bawah sidebar walau nav items pendek; (4) cek juga route `/finance`, `/customers` — pastikan semua halaman dashboard berperilaku sama. Mobile viewport 360px/390px: layout tetap column, mobile-nav sticky header + bottom-nav fixed, content scroll mandiri di dalam content area.


---

## Fase 8 — Manajemen Akun, Pengaturan & Role Owner (14 task · 👤 review interface)

**Konteks**: feedback Owner — sistem sekarang cuma punya 2 role (`admin`/`teknisi`), berarti **setiap Admin bisa reversal transaksi Finance dan memproses Retur atas unit yang sudah `Terjual` tanpa batas**. Ini gap keamanan/integritas data, bukan cuma fitur nice-to-have. Ditambahkan role `owner` (superset Admin) dengan 2 aksi eksklusif (reversal Finance, Retur) plus Modul 10 baru: manajemen akun dan `app_settings` lewat UI (sebelumnya cuma bisa via SQL manual). Keputusan desain: role tetap (bukan permission matrix granular) — lihat `AGENTS.md` §11 untuk alasan lengkap. Spec lengkap di `FSD.md` §2.9 (F-SET-01 s.d. F-SET-03) dan `SPEC.md` §3.5.

- [x] Migration: `CREATE TABLE admin_actions_log` (lihat `SPEC.md` §3.5), function `require_owner()` (`security definer`, raise exception bila `app_metadata.role <> 'owner'`) — file `202607120010_fase8_owner.sql`, termasuk `is_owner()`, `log_admin_action()`, patch `reverse_transaction` & `process_return`, update RLS `app_settings`, seed `stock_aging_alert_days`
- [x] **Bootstrap manual (sekali jalan, bukan via RPC — chicken-and-egg problem karena `require_owner()` butuh owner yang sudah ada)**: akun Owner sudah dibuat manual oleh Owner lewat Supabase Dashboard — email `mobimku@gmail.com`, `raw_app_meta_data.role = 'owner'` sudah di-set. **Password TIDAK dicatat di dokumen manapun** (bukan di sini, bukan di `HANDOFF.md`, bukan di commit message) — kalau agent butuh login untuk testing, minta Owner input langsung saat sesi berjalan, jangan pernah menyimpan/menampilkan password di file yang ter-commit ke git. Agent tinggal verifikasi akun ini bisa login dan `app_metadata.role` terbaca `owner` di JWT, tidak perlu mengulang proses pembuatan akun.
- [x] RPC `create_account(p_email, p_role, p_nama)`: panggil `require_owner()`, Supabase Admin API `createUser` + set `app_metadata.role`, insert `admin_actions_log` — **Catatan**: diimplementasikan via API route `POST /api/settings/accounts` (Admin API tidak bisa dipanggil dari dalam PostgreSQL function). RPC `log_admin_action` dipakai untuk audit log. API route gate: `role === 'owner'`.
- [x] RPC `deactivate_account(p_user_id)` & `reactivate_account(p_user_id)`: panggil `require_owner()`; `deactivate_account` **wajib** menolak bila target adalah `owner` aktif terakhir (`select count(*) ... where role='owner' and <aktif>) <= 1`); insert `admin_actions_log` — **Catatan**: diimplementasikan via API route `PATCH /api/settings/accounts/[id]` dengan `ban_duration = '720h'` (deactivate) / `'none'` (reactivate). Last-owner guard di level API route.
- [x] RPC `update_app_setting(p_key, p_value)`: panggil `require_owner()`, simpan value lama ke `admin_actions_log.detail.before`, update `app_settings` — **Catatan**: diimplementasikan via API route `PATCH /api/settings/app-settings`. Value lama disimpan di `detail.before` via `log_admin_action` RPC.
- [x] RPC `finance_reversal(p_id_transaksi, p_catatan)`: panggil `require_owner()`, insert `finance_transactions` (`is_reversal=true`, `reversal_of`), insert `admin_actions_log` — **ganti** mekanisme reversal lama (kalau sebelumnya bisa dipanggil Admin) jadi lewat RPC ini saja — **Catatan**: sesuai keputusan Owner, tidak dibuat function baru. `reverse_transaction` (nama asli Fase 5) di-patch in-place: tambah `require_owner()` di baris pertama + insert `admin_actions_log` (aksi = `'finance_reversal'`). Tanpa rename, tanpa alias — patch minimal.
- [x] Ubah RPC/endpoint Retur (F-FIN-06) yang sudah ada: tambah `require_owner()` sebagai baris pertama — Admin yang mencoba memanggil `POST /api/returns` sekarang harus dapat 403, bukan sukses seperti sebelumnya — **Catatan**: `process_return` RPC di-patch in-place: tambah `require_owner()` + insert `admin_actions_log`. Endpoint `POST /api/finance` dengan `action: "return"` tetap dipakai — gate API route diperluas ke `admin || owner`, tapi RPC menolak non-owner.
- [x] API routes: `GET/POST /api/settings/accounts`, `PATCH /api/settings/accounts/[id]`, `GET/PATCH /api/settings/app-settings`, `GET /api/settings/activity-log`, `POST /api/finance/[id]/reversal` (lihat `SPEC.md` §5) — **Catatan**: `POST /api/finance/[id]/reversal` tidak dibuat terpisah karena reversal tetap lewat `POST /api/finance` dengan `action: "reversal"` (pola konsisten semua aksi Finance). RPC `reverse_transaction` sudah di-gate `require_owner()`.
- [x] UI: halaman Manajemen Akun (`/settings/accounts`) — list akun + status, form buat akun baru, tombol nonaktifkan/reaktivasi
- [x] UI: halaman Pengaturan Aplikasi (`/settings/app-settings`) — form edit `default_warranty_unit_days`, `default_warranty_service_days`, `stock_aging_alert_days`; Admin lihat read-only, Owner bisa edit
- [x] UI: halaman Log Aktivitas (`/settings/activity-log`) — tabel read-only, filter by jenis aksi & aktor
- [x] Nav: item menu "Pengaturan" hanya render untuk role `owner` (desktop sidebar + mobile drawer, sesuai `SPEC.md` §2.1); tombol "Proses Retur" dan "Koreksi/Reversal" di halaman Finance/Sales/Servis hanya render untuk `owner`, tidak ada untuk `admin` — **Catatan**: Finance forms di `finance-forms.tsx` menerima `isOwner` prop. Sales/Service detail pages tidak punya tombol retur langsung — retur dilakukan dari halaman Finance.
- [~] Uji akses: login sebagai `admin` → pastikan (1) menu Pengaturan tidak muncul, (2) `POST /api/returns` dan `POST /api/finance/[id]/reversal` menolak dengan 403, (3) endpoint `/api/settings/*` menolak dengan 403 — semua dicek di response API, bukan cuma UI tersembunyi — **Butuh: migration dijalankan + build + deploy + manual testing**
- [~] Uji akses: login sebagai `owner` → semua aksi di atas berhasil; coba nonaktifkan akun `owner` satu-satunya yang aktif → harus ditolak dengan pesan jelas — **Butuh: migration dijalankan + build + deploy + manual testing**
- [x] Update `HANDOFF.md` — entri Fase 8 (sertakan detail bootstrap manual di atas, karena ini langkah yang tidak terulang otomatis kalau environment di-reset)

👤 **Review interface**: login sebagai admin dan owner di dua browser/incognito berbeda, cek satu-satu skenario di dua task "Uji akses" di atas secara manual — ini fase yang paling penting untuk dicoba langsung karena menyangkut kontrol akses data finansial, bukan cuma tampilan.

---

## Fase 8.1 — Owner Role Fixes, Settings UI, Mobile Scroll & Data Cleanup (6 task · 👤 review interface)

**Konteks**: setelah deploy Fase 8, ditemukan owner masih diblokir di banyak endpoint/page karena role checks masih `!== "admin"` tanpa include `"owner"`. Juga ada issue UI: settings redirect ke `/settings/accounts` tanpa link ke app-settings, form input white text di white background, scroll nyangkut di HP.

- [x] Patch 23 RPC security definer functions — `is distinct from 'admin'` → `not in ('admin', 'owner')` via `patch-rpc.mjs`
- [x] Fix 16 API route files — role checks sekarang include owner
- [x] Fix 7 UI page/component checks — bank-stock, sales, units, warranty, service, status-form
- [x] Fix settings landing page (`/settings`) — dari redirect ke `/settings/accounts` jadi landing page dengan 2 card (Manajemen Akun + Pengaturan Aplikasi)
- [x] Fix UI font putih di form settings — tambah `text-[#172019]` di input field class
- [x] Fix mobile scroll nyangkut — hapus `overflow-hidden` dari parent div (cuma di `md:`), content div tambah `flex flex-col` — Safari iOS block scroll gesture di parent overflow hidden
- [x] Hapus data dummy/testing — HP EliteBook 840 G5 (BJ-HP-2607-001), INV-2607-001, SVC-2607-001, Customer Seed & Eko
- [x] Deploy ke Vercel production — `https://bj-stock.vercel.app`
- [x] Update `HANDOFF.md` — entri Fase 8.1

👤 **Review interface**: cek bank stock dan settings sebagai owner di `https://bj-stock.vercel.app`. Tes scroll di mobile viewport 360px/390px.

---

## Fase 8.2 — Cancel Sales, Cancel Service & Customer CRUD (7 task · 👤 review interface)

**Konteks**: 3 fitur yang belum ada sejak awal: (1) membatalkan invoice penjualan, (2) membatalkan service order, (3) kelola data customer (edit/hapus).

- [x] API route `POST /api/sales/[id]/cancel` — batalkan invoice, revert unit ke Ready, akhiri warranty, reversal finance, log audit. Owner-only (require_owner).
- [x] API route `POST /api/service/[id]/cancel` — batalkan service order, kembalikan part ke Bank Stock, hapus part log, nolkan biaya, log audit. Owner-only.
- [x] API route `PATCH /api/customers/[id]` — edit nama, kontak_wa, segmen, sumber_lead. Admin+owner.
- [x] API route `DELETE /api/customers/[id]` — hapus customer (ditolak bila ada riwayat sales/service). Admin+owner.
- [x] UI: tombol "Batalkan" di halaman detail sales (owner-only, native `<dialog>` confirm)
- [x] UI: tombol "Batalkan" di halaman detail service (owner-only, native `<dialog>` confirm)
- [x] UI: tombol "Edit" (modal form) + "Hapus" (confirm) di halaman profil customer (admin+owner)
- [x] Deploy ke Vercel production — `https://bj-stock.vercel.app`
- [x] Update `HANDOFF.md` — entri Fase 8.2

**Catatan migration**: untuk mengaktifkan status `Dibatalkan` di `service_orders` (kolom status), jalankan SQL ini via Supabase Dashboard → SQL Editor:
```sql
alter table public.service_orders drop constraint if exists service_orders_status_check;
alter table public.service_orders add constraint service_orders_status_check
  check (status in ('Diterima','Diagnosa','Dikerjakan','Selesai','Diambil','Dibatalkan'));
```
Tanpa migration ini, cancel service tetap berjalan (biaya di-0-kan, parts dikembalikan) tapi status tidak berubah ke `Dibatalkan`.

👤 **Review interface**: login sebagai owner → buka detail sales → klik "Batalkan" → confirm dialog → pastikan unit kembali ke Ready di `/units`. Buka detail service → klik "Batalkan". Buka profil customer → klik "Edit" → ubah nama → save. Klik "Hapus" → confirm → pastikan customer dengan riwayat transaksi ditolak.

---

## Fase 9 — Katalog Publik (9 task · 👤 review interface)

**Konteks**: Owner ingin unit `Listed` otomatis "jadi katalog" tanpa kerja ganda posting manual. Riset menunjukkan integrasi WhatsApp Catalog (Meta Business Manager + verifikasi bisnis), Instagram auto-post (akun Business + Page + quota API), dan Facebook Marketplace (API auto-post **tidak tersedia** untuk developer umum, hanya partner commerce yang di-approve khusus) — semuanya perlu setup eksternal signifikan. **Keputusan scope dikonfirmasi Owner: hanya bangun katalog di situs sendiri dulu**, tiga integrasi lain ditunda. Spec lengkap: `FSD.md` §2.10 (F-CAT-01/02, termasuk bagian "Dependensi yang wajib diverifikasi"), `SPEC.md` route `/katalog`.

**Sinkronisasi dengan progress real**: task ini dicek ulang terhadap `HANDOFF.md` per 12 Juli 2026 (Fase 8.2 selesai) — dependensi berikut **sudah tersedia**, tidak perlu dibangun ulang: `units.harga_listing` (Fase 1.2), `app_settings` table (Fase 2.1) + `stock_aging_alert_days` sudah di-seed (Fase 8), `admin_actions_log` + role `owner` (Fase 8), foto unit via signed URL upload (Fase 7.6). Task pertama di bawah adalah **verifikasi**, bukan asumsi, karena belum pernah dicek eksplisit.

- [x] **Verifikasi dulu, jangan asumsi**: cek policy Supabase Storage bucket tempat foto unit disimpan (dari Fase 7.6/7.7) — publicly-readable atau private? Kalau private, katalog publik tidak bisa hotlink `foto_url` langsung. Kalau private: tambahkan (a) Storage policy read-only public khusus untuk foto unit berstatus `Listed`, **atau** (b) route API yang generate signed URL TTL panjang dipanggil dari halaman katalog. Catat hasil verifikasi + keputusan di `HANDOFF.md` sebelum lanjut task berikutnya.
- [x] Migration: tambah `app_settings` key `store_whatsapp_number` (lihat `SPEC.md` §3, blok "APP SETTINGS") — **cek dulu apakah sudah ada** dari migration Fase 8 (`202607120010_fase8_owner.sql` menyebut seed `stock_aging_alert_days`, belum tentu termasuk `store_whatsapp_number`); kalau belum ada, tambahkan lewat migration baru, jangan edit migration lama yang sudah di-apply
- [x] UI: tambahkan field `store_whatsapp_number` ke halaman Pengaturan Aplikasi (`/settings/app-settings`, sudah ada dari Fase 8.1) — Owner isi nomor WA toko dari sana, bukan lewat SQL manual
- [x] Halaman `/katalog` (server component, publik, tanpa sidebar admin — pola sama `/s/[id_servis]`): grid unit `status = 'Listed'` AND `harga_listing is not null`, kartu berisi foto utama + brand + model + `kondisi_fisik` + `harga_listing`
- [x] Halaman `/katalog/[id_unit]`: galeri foto lengkap, `spek_saat_ini`, kondisi fisik & fungsi, `harga_listing`, tombol "Hubungi via WhatsApp" (`wa.me/<store_whatsapp_number>?text=...`) — disabled dengan pesan jelas kalau `store_whatsapp_number` masih kosong
- [x] Halaman "unit tidak tersedia" untuk `id_unit` yang tidak ditemukan atau statusnya sudah bukan `Listed` (termasuk `Delisted`, `Terjual`) — bukan error mentah/redirect diam-diam
- [x] Open Graph meta tags per halaman detail (title, description, image, harga) — verifikasi preview muncul benar saat link di-paste ke chat WhatsApp (pakai [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) atau kirim langsung ke WA test)
- [x] Pastikan **tidak ada** field `modal_awal`/`total_modal`/`serial_number` yang ter-render di HTML halaman katalog manapun (cek via view-source, bukan cuma "nggak kelihatan di UI") — sesuai BR-09
- [x] Update `HANDOFF.md` — entri Fase 9 (sertakan hasil verifikasi Storage bucket di task pertama)

👤 **Review interface**: buka `/katalog` di browser tanpa login (mode incognito) — pastikan unit yang tampil sesuai status `Listed` dan fotonya kebaca (bukan broken image, ini yang paling mungkin gagal kalau verifikasi bucket di atas dilewatkan). Klik salah satu unit → cek detail dan tombol WA berfungsi. Share link detail unit ke chat WhatsApp pribadi, pastikan preview foto+judul muncul.

---

## Fase 9.1 — Analytics Katalog Anonim (8 task · 👤 review interface)

**Konteks**: Owner membutuhkan data kunjungan katalog yang bisa ditindaklanjuti tanpa mengumpulkan identitas pelanggan. Scope dibatasi ke tiga event (`catalog_view`, `detail_view`, `whatsapp_click`), session ID acak first-party, dan laporan agregat. IP, fingerprint perangkat, lokasi presisi, serta raw user activity feed tidak disimpan. Event dari akun `owner`/`admin`/`teknisi` ditandai internal dan dikecualikan dari statistik utama; perangkat staf yang membuka katalog tanpa login tetap dihitung sebagai publik karena sistem tidak melakukan fingerprinting.

- [x] Dokumentasikan scope, privasi, definisi visitor unik, konversi, dan batas pembedaan trafik internal di `BRD.md`, `FSD.md`, dan `SPEC.md`
- [x] Migration: tambah tabel event analytics katalog, constraint tiga tipe event, indeks agregasi, RLS tertutup, dan RPC SECURITY DEFINER untuk pencatatan serta laporan
- [x] API first-party: validasi event dengan Zod, baca role session server-side, lalu simpan event sebagai internal/publik tanpa menerima flag role dari browser
- [x] Instrumentasi `/katalog` dan `/katalog/[id_unit]`: catat `catalog_view`, `detail_view`, dan klik WhatsApp satu kali per session/event relevan tanpa mengubah filter URL
- [x] Laporan katalog untuk Admin/Owner: periode 7/30 hari, visitor unik, detail view, klik WhatsApp, conversion detail → WhatsApp, dan unit paling banyak dilihat; trafik internal dikecualikan secara default
- [x] Verifikasi database: event invalid ditolak, event anon tersimpan tanpa PII, event staf bertanda internal, agregat 7/30 hari benar, dan RPC laporan ditolak untuk anon/teknisi
- [x] Verifikasi UI di viewport 360px/390px dan desktop; jalankan lint/typecheck/build serta flow publik → detail → WhatsApp dan laporan Admin/Owner
- [x] Deploy migration ke Supabase dan aplikasi ke Vercel; verifikasi production lalu update checklist serta `HANDOFF.md`

👤 **Review interface**: buka katalog incognito dan lakukan flow list → detail → WhatsApp, lalu login Admin/Owner dan pastikan angka laporan bertambah tanpa mencampurkan kunjungan katalog dari sesi staf yang sedang login.

---

## Fase 9.2 — Penggantian Unit Dalam Garansi (10 task · 👤 review interface)

**Konteks**: unit yang sudah terjual dapat mengalami kerusakan selama garansi dan perlu diganti unit lain. Penggantian bukan retur tunai dan bukan penjualan baru: invoice asli tetap, revenue tidak digandakan, unit rusak kembali ke `QC`, unit pengganti menjadi `Terjual`, dan Finance hanya mencatat selisih harga yang benar-benar berpindah. Aksi final menyentuh Sales/Finance final sehingga Owner-only melalui `require_owner()`.

**Kebijakan disetujui Owner**: harga sama tidak membuat transaksi Finance; unit lebih mahal mewajibkan top-up langsung; unit lebih murah mewajibkan refund selisih; piutang cicilan lama tetap; garansi baru berakhir pada tanggal paling akhir antara garansi lama dan tanggal penggantian + `replacement_grace_days` (default 7); service order klaim terkait ditutup `Diambil` atomik dengan tindakan penggantian.

- [x] Sinkronkan `AGENTS.md`, `BRD.md`, `FSD.md`, dan `SPEC.md`: alur F-WRT-04, exception status replacement, akses Owner-only, margin/read model, serta larangan memakai Cancel/Retur biasa
- [x] Migration: seed `replacement_grace_days`, tambah tabel immutable `warranty_replacements`, constraint/index/RLS, kategori Finance selisih penggantian, dan read model current delivered unit
- [x] RPC atomik `replace_warranty_unit`: validasi klaim/garansi/sale/unit, idempotency, status unit, warranty baru, service closure, Finance selisih, dan audit log dalam satu transaksi
- [x] Regression DB: harga sama, top-up, refund, replacement berulang, role non-Owner, garansi habis, unit pengganti invalid, claim duplicate, idempotency, serta rollback tanpa partial state
- [x] API owner-only + Zod untuk proses penggantian dan endpoint/read path kandidat unit `Ready`/`Listed`
- [x] UI mobile-first di detail Sales/Garansi: pilih klaim dan unit pengganti, nilai pengganti, preview selisih, akun Finance kondisional, alasan, serta konfirmasi dampak
- [x] Invoice/receipt dan riwayat penggantian: tampilkan rantai unit lama → baru, harga/selisih, garansi baru, dan QR/unit aktif tanpa mengubah snapshot invoice asli
- [x] CRM dan Laporan: tampilkan unit yang saat ini diterima customer, nilai transaksi/margin tersesuaikan, tanpa revenue atau jumlah sales ganda
- [ ] Verifikasi typecheck/build/DB test dan browser flow 360px/390px/desktop untuk sama harga, top-up, refund, role gate, dan print receipt — **DB test/typecheck/targeted lint/build lulus 15 Juli 2026; browser dan print direview manual oleh Owner di production**
- [x] Deploy migration Supabase + Vercel, smoke test production, lalu update checklist dan `HANDOFF.md` — migration `016`, `202607142158`, `150001`–`150003` sinkron remote; production aktif di `https://bj-stock.vercel.app`

👤 **Review interface**: Owner buka invoice dengan garansi aktif, proses satu penggantian ke unit `Ready`/`Listed`, lalu cek unit lama masuk `QC`, unit baru `Terjual`, warranty/servis/Finance/CRM/report konsisten dan bukti penggantian bisa dicetak.

---

## Fase 9.3 — Patch: Pre-Payment Unit Testing F-SLS-02 (5 task · 👤 review interface)

**Konteks**: Owner ingin pembeli melihat hasil pengetesan unit sebelum memutuskan membeli, sebagai bentuk transparansi dan penguat kepercayaan. Test dilakukan setelah scan QR dan input data customer, sebelum konfirmasi jual — satu action final tanpa draft atau endpoint terpisah. Spec lengkap: `FSD.md` F-SLS-02 (12 kategori, outcome 160 char, hard blocker, buyer acknowledgement server-controlled, cetakan kontrak A4 landscape), `SPEC.md` §3.5 (tabel `sale_unit_tests`, `create_sale` RPC, immutable trigger).

- [x] Dokumentasi F-SLS-02 di FSD.md, SPEC.md, dan TODO.md — definisi 12 kategori test, outcome 160 char, 7 hard blocker, buyer acknowledgement server-controlled, atomic `create_sale`, immutable trigger, cetakan A4 landscape tanpa shrink invoice
- [x] Migration: tabel `sale_unit_tests` (JSONB test_results + blocking_checks, lokasi, trusted_tester, acknowledgement_text server-controlled, confirmed_at), kolom `sales.id_sale_test` nullable + composite FK `(id_sale_test, id_unit)` + unique consumption index, trigger immutable, RLS, RPC `create_sale(p_test jsonb)` — dipulihkan forward-only lewat `202607150001_f_sls_02_reconciliation.sql`, aman direplay atas object remote yang belum tercatat, dan DB test lulus
- [x] UI: halaman pre-payment test (terintegrasi dalam form transaksi jual, tanpa draft) — 12 kategori dengan radio Lulus/Ada Catatan/Tidak Diuji, textarea catatan kondisional (max 160 char), buyer acknowledgement checkbox unchecked default, submit sebagai satu action `POST /api/sales`
- [x] UI cetakan kontrak A4 landscape: invoice existing di kiri (ukuran asli, tidak dikecilkan), ringkasan test 12 baris fixed di kanan — 3 kolom: kategori, hasil L/AC/TU, catatan 160 char — font/spasi panel kanan menyesuaikan agar muat satu halaman
- [x] Build & lint lulus (tsc --noEmit, targeted source lint, build production)
- [x] Deploy migration ke Supabase + aplikasi ke Vercel, smoke test production, update `HANDOFF.md` — migration `202607150001`–`150003` sinkron remote; login page production merespons normal

👤 **Review interface**: login admin → buka form transaksi jual untuk unit `Ready`/`Listed` → isi 12 kategori test → centang buyer acknowledgement → konfirmasi jual — pastikan test immutable setelah sale. Coba kirim tanpa test lengkap, tanpa centang acknowledgement, atau dengan hard blocker gagal → semua ditolak dengan pesan spesifik. Cetak kontrak A4 landscape → pastikan invoice kiri ukuran asli, test summary kanan muat satu halaman, catatan 160 karakter tampil penuh.

---

## Fase 9.4 — Patch: Sales UX & Mobile Overlay (6 task · 👤 review interface)

**Konteks**: review production 9.2–9.3 menemukan tombol tukar unit hilang ketika klaim/kandidat belum tersedia, bottom navigation mobile menutup area UI, sumber lead Facebook Marketplace belum tersedia, dan form Sales terlalu panjang karena detail transaksi bercampur dengan kuisioner test.

- [x] Invoice Owner: tampilkan tombol "Tukar unit" selama garansi aktif; jika klaim atau kandidat belum ada, dialog menjelaskan prasyarat dan menonaktifkan konfirmasi alih-alih menyembunyikan aksi
- [x] Mobile layout: reservasi tinggi bottom navigation pada dashboard shell agar layer `fixed` tidak menutup konten, termasuk safe-area perangkat
- [x] Sales dua langkah dalam satu form: Detail customer/transaksi + model unit → Pengujian unit; tetap satu `POST /api/sales` dan satu RPC atomik tanpa draft
- [x] Migration `202607150004`: tambahkan `Facebook Marketplace` ke constraint `customers.sumber_lead`; sinkronkan Sales, Servis, edit Customer, dan Zod
- [x] Verifikasi DB regression, typecheck, dan production build tanpa Playwright
- [x] Deploy Supabase + Vercel production dan smoke test — migration sinkron sampai `202607150004`; `/login` dan `/katalog` 200, `/sales` tanpa sesi redirect 307 ke `/login`

👤 **Review interface**: cek invoice Owner dengan garansi aktif, form Sales dua langkah, serta ruang bawah UI pada viewport 360px/390px. Playwright sengaja tidak dijalankan sesuai instruksi Owner.

---

## Fase 9.5 — Hotfix: Owner Login Loop (4 task · 🤖 self-verify)

**Konteks**: login form menerima role `owner`, tetapi shared `proxy.ts` masih hanya mengizinkan `admin`/`teknisi`. Setelah login sukses, request Owner ke `/units` langsung diarahkan kembali ke `/login`, sehingga terlihat seperti kredensial gagal.

- [x] Verifikasi akun Owner Supabase: satu akun, email confirmed, aktif, dan `app_metadata.role = owner`
- [x] Tambahkan `owner` ke role guard pusat di `proxy.ts`
- [x] Typecheck + production build lulus; deploy Vercel production
- [x] Smoke test authenticated production memakai sesi Owner sementara: `/units` merespons 200 tanpa redirect, lalu sesi direvoke

🤖 **Self-verify**: hotfix satu kondisi role di proxy; tidak ada perubahan password, metadata akun, database, atau alur login form.

---

## Fase 9.6 — Hotfix: Aksi Invoice Mobile (4 task · 👤 review interface)

**Konteks**: dropdown klaim pada modal Tukar unit tampak hilang karena production belum memiliki klaim garansi, sehingga `<select>` kosong. Tombol Cetak invoice juga kurang terlihat saat action toolbar membungkus di mobile.

- [x] Empty-state dropdown klaim menampilkan opsi `Belum ada klaim garansi`, bukan select kosong
- [x] Tambahkan CTA `Buat klaim garansi` langsung ke unit aktif; proses replacement tetap tidak boleh melewati syarat klaim F-WRT-04
- [x] Toolbar invoice mobile selebar container dan tombol Cetak invoice mengambil sisa lebar agar tidak terdesak tombol Batalkan
- [x] Typecheck/build/deploy lulus; authenticated production invoice memuat tombol print, empty-state klaim, dan CTA buat klaim

👤 **Review interface**: buka invoice Owner pada HP, cek tombol Cetak invoice terlihat. Klik Tukar unit; bila belum ada klaim, buat klaim melalui CTA, kembali ke invoice, lalu dropdown menampilkan klaim tersebut.

---

## Fase 9.7 — Hotfix: Print Orientation & Formatting (4 task · 👤 review interface)

**Konteks**: global `@page { size: A4 landscape }` dan lebar invoice tetap `281mm` membuat pilihan Portrait/Landscape pada print dialog menghasilkan preview yang sama. Rule global juga memaksa bukti penggantian dan nota lain ke Landscape.

- [x] Hapus pemaksaan orientasi dari `@page`; pertahankan margin A4 8 mm
- [x] Layout invoice/test responsif terhadap orientasi: Landscape `174mm + 103mm`, Portrait `114mm + 76mm` dengan tinggi/tipografi panel test disesuaikan
- [x] Bukti penggantian dan dokumen lain mengikuti pilihan orientasi browser secara alami
- [x] Typecheck/build/deploy lulus; production CSS memuat kedua orientation query dan tidak memuat `size: A4 landscape`

👤 **Review interface**: buka print preview invoice dan bukti penggantian, ubah Portrait ↔ Landscape, pastikan ukuran halaman/layout berubah dan konten tidak terpotong. Keduanya ditargetkan tetap satu lembar A4.

---

## Fase 9.8 — Hotfix: Mobile Dynamic Viewport Scroll (4 task · 👤 review interface)

**Konteks**: `body { overflow: hidden }` masih aktif global dan dashboard mobile memakai nested internal scroller. Saat address/navigation bar browser HP menyembunyikan diri dan visual viewport berubah, body tetap terkunci sehingga gesture scroll dapat berhenti. Fixed bottom nav juga bergantung pada padding layout viewport yang dapat tidak sinkron dengan visual viewport.

- [x] Mobile memakai window/document scroll alami; `body overflow:hidden` dan internal `dashboard-content` scroll hanya berlaku pada `md`/desktop
- [x] Dashboard mobile memakai `min-h-dvh`, header sticky, dan ruang bawah sebesar tinggi bottom nav + safe-area
- [x] Hilangkan nested scroller mobile; `overflow-x-hidden` content dipindah ke desktop karena body sudah menahan overflow horizontal
- [x] Typecheck/build/deploy lulus; Edge authenticated 390px dengan viewport berubah 844→700 tetap document-scrollable dan overlap nav = 0

👤 **Review interface**: pada HP asli, buka halaman panjang lalu scroll sampai address bar browser hilang/muncul kembali. Pastikan gesture tetap bekerja dan elemen paling bawah dapat digulir penuh di atas bottom nav.

---

## Fase 9.9 — Hotfix: Session Refresh Semua Role (4 task · 🤖 self-verify)

**Konteks**: server Supabase client membuang cookie hasil refresh lewat `setAll: () => {}`, sedangkan proxy yang dapat menulis cookie hanya mencakup sebagian route. Setelah browser client login unmount dan access token habis, refresh token tidak dipersistenkan sehingga Owner/Admin/Teknisi tampak logout sendiri.

- [x] Implementasikan `setAll` pada `lib/supabase/server.ts`; Route Handler/Server Action dapat menulis cookie, Server Component aman fallback ke proxy
- [x] Perluas matcher proxy ke seluruh halaman authenticated: dashboard, operasional, finance, reports, export, help, dan settings
- [x] Typecheck/build/deploy Vercel production lulus
- [x] Production refresh test dengan cookie sengaja kedaluwarsa: Owner page 200, Teknisi page 200, Admin API terautentikasi; ketiganya mengirim cookie sesi baru

🤖 **Self-verify**: tidak ada perubahan password, role, durasi token, atau policy Supabase. Fix hanya memastikan refresh cookie standar Supabase SSR tidak dibuang.

---

## Fase 9.10 — Upgrade Log: Lepas Part / Downgrade (5 task · 👤 review interface)

**Konteks**: trigger Upgrade Log sudah mendukung `DELETE` atomik (restock part dan recalculate modal), tetapi halaman detail hanya menyediakan pemasangan part. Part yang salah pasang atau akan diganti tidak dapat dilepas lewat aplikasi.

- [x] Tambahkan `DELETE /api/units/[id]/upgrade` untuk Admin/Owner/Teknisi dengan validasi UUID dan filter unit pemilik log
- [x] Batasi aksi hanya untuk log Bank Stock (`id_part IS NOT NULL`); log jasa eksternal tidak dapat dihapus lewat jalur downgrade
- [x] Tambahkan tombol **Lepas part**, konfirmasi native, pending state, error, dan refresh pada setiap Upgrade Log part
- [x] Verifikasi DB regression: setelah log part dilepas, stok `3 → 4` dan `total_modal` kembali `3.150.000 → 2.750.000`; typecheck dan production build lulus
- [x] Update `FSD.md`, `SPEC.md`, `TODO.md`, dan `HANDOFF.md`

👤 **Review interface**: production belum memiliki fixture Upgrade Log part. Pasang satu part dari detail unit, lalu klik **Lepas part** dan pastikan log hilang, stok Bank Stock bertambah satu, serta Total Modal berkurang sebesar biaya historis part. Log jasa tidak boleh menampilkan tombol.

---

## Fase 9.11 — Upgrade Log: Downgrade Spek Manual (8 task · 👤 review interface)

**Konteks**: spesifikasi unit ditulis manual dan Upgrade Log sebelumnya hanya dapat menambah modal lewat part Bank Stock atau jasa. Laptop over-spec (mis. RAM 8 GB) perlu dapat diturunkan ke 4 GB dengan pengurangan modal, tanpa otomatis memasukkan part copotan ke Bank Stock.

- [x] Tulis rencana implementasi `docs/plans/2026-07-15-manual-spec-downgrade.md`
- [x] Migration `202607150005`: tambah discriminator `upgrade_log.jenis` (`part`/`service`/`downgrade`) dan `spek_setelah`; backfill seluruh log existing
- [x] Ubah formula server menjadi `modal_awal + SUM(part/service) − SUM(downgrade)`; Finance hanya menjurnal `jenis = service`, Bank Stock tetap hanya bergerak bila `id_part` terisi
- [x] RPC atomik `add_unit_downgrade`: role Admin/Owner/Teknisi, row lock, status stok aktif, nominal >0, spek wajib, hasil modal >0, insert log + update spek dalam satu transaksi
- [x] Hardening: direct insert downgrade wajib ditolak, downgrade immutable dari UPDATE/DELETE client; migration koreksi `202607150006` membuat role guard null-safe
- [x] API/Zod/UI: mode ketiga **Downgrade spek (kurangi modal)**, input nominal + spek setelah, history bertanda minus, tanpa mutasi Bank Stock otomatis
- [x] TDD dan regression: modal `3.000.000 → 2.800.000`, spek RAM 4 GB, stok tetap 4, jumlah jurnal UpgradeLog tetap, over-reduction rollback; semua DB suites/typecheck/build lulus
- [x] Deploy Supabase sampai `202607150006` + Vercel production; authenticated smoke Teknisi lulus dan tidak memutasi data bisnis

👤 **Review interface**: buka unit stok aktif di `https://bj-stock.vercel.app`, pilih **Tambah upgrade / downgrade → Downgrade spek**, isi pengurangan modal dan spek baru. Setelah simpan, pastikan Upgrade Log menampilkan nominal merah bertanda minus, Total Modal turun, Spek Saat Ini berubah, Bank Stock/Finance tidak bergerak. Gunakan unit dummy karena aksi downgrade immutable.

---

## Fase 9.12 — Hotfix Katalog Desktop Scroll & Compact UI (5 task · 👤 review interface)

**Konteks**: global desktop `body { overflow: hidden }` dibutuhkan dashboard, tetapi ikut mengunci scroll halaman publik `/katalog`. Grid katalog juga tetap dua kolom pada desktop sehingga setiap card mencapai sekitar 694px dan terlihat terlalu besar.

- [x] Pindahkan desktop body lock ke `body:has(.dashboard-shell)` agar hanya dashboard memakai internal scroller
- [x] Batasi katalog list ke `max-w-6xl` dengan grid 2/3/4/5 kolom responsif; perkecil logo/header pada desktop
- [x] Padatkan filter desktop dan ubah detail katalog menjadi layout dua kolom `max-w-5xl`
- [x] Verifikasi tanpa Chrome: TypeScript lulus, Next.js webpack build lulus, Vercel Turbopack build lulus, dan `git diff --check` bersih
- [x] Deploy Vercel production dan HTTP smoke: katalog 200, class compact tersedia, CSS body lock hanya untuk dashboard, redirect auth tetap aktif

👤 **Review interface**: buka `/katalog` pada desktop dan pastikan wheel/touchpad dapat scroll, card tampil rapat 4–5 kolom sesuai lebar layar, lalu buka detail unit dan pastikan foto serta informasi tampil dua kolom. Mobile tetap dua kolom. Browser automation tidak dipakai sesuai instruksi Owner.

---

## Fase 9.13 — Katalog Harga, Share & Lokasi (7 task · 👤 review interface)

**Konteks**: Owner meminta katalog publik tidak menampilkan Grade, filter berfokus pada harga, sort mencakup harga dan umur update, tagline baru, serta action Share dan Google Maps pada detail unit.

- [x] Migration `202607160001`: seed `store_google_maps_url`, tambah `updated_at` ke list RPC, dan hapus `kondisi_fisik` dari kontrak RPC katalog publik tanpa mengubah data Grade internal
- [x] Ganti tagline menjadi **Katalog lengkap dan update.**
- [x] Ganti filter Grade menjadi chip harga: Semua, < Rp2jt, Rp2–5jt, > Rp5jt
- [x] Sort menjadi Termurah, Termahal, Terbaru, Terlama dengan tie-break ID unit
- [x] Tambah setting Owner URL Google Maps tervalidasi HTTPS; kosong menampilkan action disabled
- [x] Tambah action Bagikan (native share + clipboard fallback) dan Buka lokasi; mobile di atas WhatsApp, desktop lebar sebagai floating rail
- [x] TDD migration/source, full DB suite, typecheck, webpack/Vercel build, migration sync, dan production HTTP/RPC smoke lulus tanpa Chrome

👤 **Review interface**: Owner isi **URL Google Maps Toko** di `/settings/app-settings`, lalu cek detail katalog pada HP dan desktop. Pastikan Share membuka share sheet di HP atau menyalin link di desktop; Lokasi membuka Maps; tombol tidak menutup WhatsApp. Grade tidak boleh terlihat di list/detail.

---

## Fase 9.14 — Share Analytics, Mobile Reports & Spreadsheet CSV (6 task · 👤 review interface)

**Konteks**: Owner ingin Bagikan dilacak sebagai metrik engagement katalog, halaman Reports dapat dipakai di HP tanpa horizontal scroll, dan data utama bisa diekspor ke spreadsheet tanpa harus screenshot atau copy-paste manual.

- [x] Migration `202607160002_fase9_14_report_exports.sql`: tambah `share_click` ke CHECK constraint `catalog_events.event_type`; replace `record_catalog_event()` dan `get_catalog_analytics()`; tidak membuat RPC export
- [x] `SPEC.md` & `FSD.md`: perbarui event type `catalog_events` dengan `share_click`, definisi aktivasi semantics (bukan bukti terkirim), agregat `share_clicks`; tambah `GET /api/reports/export` dengan lima dataset (`margin`, `turnover`, `leads`, `catalog-summary`, `catalog-top-units`), parameter `start`/`end`/`days=7|30`, Admin/Owner gate, UTF-8 BOM + formula protection apostrof; perluas F-CAT-03 ke empat event dan F-FIN-04 dengan CSV export
- [x] `GET /api/reports/export` API route: panggil RPC agregat existing, parameter `start`/`end` untuk non-katalog atau `days=7|30` untuk katalog, Admin/Owner gate, UTF-8 BOM, formula protection apostrof di sel teks berbahaya; dataset `catalog-*` hanya agregat tanpa raw event
- [x] UI `/reports`: kartu di mobile (`< md`), tabel penuh di desktop (`>= md`); metrik Klik Bagikan ditambahkan; link export CSV per dataset; konversi WhatsApp tetap `whatsapp_click / detail_view` tanpa digabung Bagikan
- [x] TDD, full DB suite, typecheck, webpack/Vercel build, migration sync, dan production HTTP/RPC smoke lulus tanpa Chrome
- [x] Update `HANDOFF.md` — entri Fase 9.14

👤 **Review interface**: tampilan kartu Reports di mobile dan tabel di desktop perlu review Owner pada viewport 360px/390px dan desktop. CSV export dapat diuji lewat link download per dataset.

---

## Fase 9.15 — Hotfix Settings replacement_grace_days (6 task · 👤 review interface)

**Konteks**: Owner melaporkan bahwa menyimpan perubahan di `/settings/app-settings` gagal dengan error `Key "replacement_grace_days" tidak dikenali`. Root cause dikonfirmasi: API route dan form memiliki daftar key lokal yang tertinggal pada lima key, sedangkan tabel production sudah memiliki enam key.

- [x] Investigasi root cause: remote memiliki enam key; API/form hanya mengenali lima dan melewatkan `replacement_grace_days`; direct Owner update membuktikan schema/RLS bukan penyebab
- [x] RED regression test: `app-settings-contract.test.mjs` gagal pada shared contract yang belum ada, daftar lima key, dan tiga numeric key
- [x] Sinkronkan whitelist: `lib/app-settings.ts` menjadi satu metadata source untuk enam key; API dan form tidak lagi memiliki daftar lokal
- [x] Verifikasi production tanpa Chrome: authenticated GET → PATCH unchanged enam key → GET semuanya 200; nilai sebelum/sesudah identik dan `replacement_grace_days` terbaca
- [x] Full DB suite, strict audit, typecheck, local/Vercel production build lulus; deploy `bj-stock-qrvfo4r12-mobimku-1297s-projects.vercel.app`
- [x] Update `HANDOFF.md` — entri Fase 9.15

👤 **Review interface**: menyimpan form `/settings/app-settings` adalah alur yang dapat direview Owner. Root cause perlu dikonfirmasi lewat audit whitelist sebelum implementasi.

---

## Fase 9.16 — Daftar Unit: Foto, Kartu/Daftar & Sort (7 task · 👤 review interface)

**Konteks**: daftar internal `/units` masih hanya berupa kartu tanpa preview foto dan hanya menampilkan Total Modal. Owner menyetujui Harga Listing sebagai sumber sort Termurah/Termahal dan nominal utama, dengan Total Modal tetap terlihat sebagai informasi biaya internal.

- [x] Riset dua gelombang dan plan keputusan-lengkap: Card default, List operasional, preview 4:3, native sort, serta state `brand`/`status`/`sort`/`view` di URL
- [x] Ekstrak design contract existing BJ Stock ke `DESIGN.md` sebelum perubahan komponen
- [x] RED regression contract untuk field foto/harga, lima sort deterministik, null harga terakhir, dua view, dan preservasi URL
- [x] Implementasi server-rendered `/units`: Harga Listing utama, Total Modal sekunder, `Belum diatur`, foto/fallback, mode Kartu/Daftar, dan sort
- [x] Full DB suite, strict audit, typecheck, production build, serta visual/runtime QA Microsoft Edge pada 360px, 390px, dan desktop
- [x] Deploy Vercel production dan authenticated smoke seluruh kombinasi sort/view/filter tanpa Google Chrome
- [x] Update `TODO.md` dan `HANDOFF.md` hanya setelah production smoke lulus

👤 **Review interface**: setelah deploy, buka `/units` pada HP. Bandingkan Kartu dan Daftar, coba lima urutan, pastikan filter tetap tersimpan, foto 4:3 tidak membuat layout bergeser, Harga Listing terlihat lebih utama daripada Total Modal, dan unit tanpa harga terbaca `Belum diatur`.

---

## Fase 9.17 — Optimasi Foto Unit Responsif (6 task · 👤 review interface)

**Konteks**: seluruh foto unit internal dan katalog sudah memakai `next/image`, tetapi prop `unoptimized` memaksa browser mengunduh file Supabase asli sampai 3024×4032. Baseline Microsoft Edge production mengonfirmasi URL raw tanpa `srcset`/`sizes`; forced decode foto full-size juga melewati batas waktu 30 detik.

- [x] RED source contract untuk seluruh surface foto unit: optimizer wajib aktif dan `sizes` wajib tersedia
- [x] Hapus `unoptimized` dan selaraskan `sizes` pada Card/Daftar `/units`
- [x] Hapus `unoptimized` pada galeri internal serta list/detail/lightbox katalog tanpa mengubah OpenGraph URL
- [x] Full DB suite, strict audit, typecheck, production build, dan source contract lulus
- [x] Runtime/visual QA Microsoft Edge pada 390px dan desktop membuktikan `/_next/image`, responsive `srcset`, serta galeri/lightbox tetap benar
- [x] Deploy Vercel production, authenticated/public smoke, lalu update `TODO.md`, `HANDOFF.md`, dan `DESIGN.md`

👤 **Review interface**: buka `/units`, mode Daftar, detail unit, `/katalog`, dan detail katalog pada HP. Foto harus tetap tajam dan proporsional, tetapi request gambar rendered harus menuju `/_next/image` pada ukuran yang sesuai viewport, bukan file Supabase asli.

---

## Fase 9.18 — Analytics Sumber Trafik Katalog (8 task · 👤 review interface)

**Konteks**: Owner perlu membandingkan channel yang membawa pengunjung katalog tanpa menyimpan URL referrer mentah atau identitas personal. Sumber pertama per tab diklasifikasi menjadi label pendek dari UTM, alias share, atau hostname referrer, lalu digunakan untuk seluruh event katalog pada tab tersebut.

- [x] Migration `202607230001`: tambah `catalog_events.traffic_source`, constraint label 48 karakter, partial index, dan agregat `top_sources`
- [x] Pertahankan RPC 3-parameter yang sudah live dan tambah overload 4-parameter tanpa default agar cutover PostgREST tidak ambigu atau downtime
- [x] Tambah classifier privacy-first + first-capture-per-tab di `sessionStorage`; event `catalog_view`, `detail_view`, `whatsapp_click`, dan `share_click` membawa `trafficSource`
- [x] Tambah tabel sumber trafik 30 hari pada Reports dan dataset CSV `catalog-top-sources`
- [x] Focused regression migration 1/1 lulus; TypeScript dan production build lokal lulus
- [x] Push migration Supabase production dan deploy Vercel production
- [x] Playwright production smoke: `catalog_view` + `detail_view` memakai source/session yang sama dan keduanya HTTP 204 tanpa console error
- [x] Update `TODO.md` dan `HANDOFF.md` setelah production smoke lulus

👤 **Review interface**: setelah trafik nyata terakumulasi, login Owner/Admin lalu buka `/reports`. Bandingkan baris sumber trafik dan ekspor CSV; event lama tanpa source wajar tampil sebagai **Tidak diketahui**.

---

## Patch — Pasca-restore & Operasional (Juli 2026) · 🤖 self-verify + 👤 review

**Konteks**: workspace lokal hilang; restore dari OpenCode + env production; hotfix bug operasional Owner; backup source ke GitHub private.

- [x] Restore `D:\BJsys` dari OpenCode snapshot; verifikasi route/build lokal vs production
- [x] Link Vercel + pull env production; Supabase CLI link `ksecrddwowrswfcbdknf`
- [x] Migration `202607200001` — partial unique index resale setelah cancel
- [x] Migration `202607200002` — koreksi finance saat edit harga Bank Stock (tanpa restock)
- [x] Migration `202607200003` — fill gap historis harga part (idempotent); verifikasi gap=0 semua part
- [x] Create akun admin/teknisi: password manual sementara (tanpa SMTP)
- [x] Normalisasi WhatsApp paste (`+`/dash/spasi/`0…`) → format `62…`
- [x] Cegah zoom iOS pada input (`font-size: 16px`)
- [x] Edit brand + model (Admin/Owner), `id_unit` tidak berubah; modal scroll-lock
- [x] Print invoice A4 landscape 1 lembar (proporsi invoice/checklist)
- [x] Sidebar desktop: footer tidak ikut scroll menu
- [x] Backup GitHub private `Mobimku/bj-stock`; tidy `.gitignore` (secret tidak di-commit)
- [x] Update `HANDOFF.md`, `TODO.md`, `FSD.md` (dokumentasi)

👤 **Review interface**: cetak 1 invoice + edit typo brand/model di HP/desktop; pastikan cancel-sale → jual ulang unit yang sama.

---

## Fase 9.19 — DP Reservation (10 task · 👤 review interface)

**Konteks**: Owner ingin pembeli bisa "booking" unit dengan DP tanpa harus langsung lunas. Reservasi mengunci unit sebagai `Dipesan`, mencatat DP masuk, dan diselesaikan lewat tiga jalur eksplisit: lunas ke sale (F-SLS-02 full), refund (Owner, refundable only), atau hangus (Admin/Owner, non-refundable only). Overdue menghalangi lunas tetapi tidak auto-resolve.

- [x] Migration `202607260001_dp_reservation.sql`: tabel `reservations`, partial unique index, trigger immutable terms, patch `enforce_unit_status_transition`, `prepare_sale` accept Dipesan via transactional flag, RPC `create_reservation`/`complete_reservation`/`refund_reservation`/`forfeit_reservation`, RLS, grant execute, `require_admin_or_owner()`, update `get_profit_loss` dengan `pendapatan_dp_hangus`, seed `Uang Muka Reservasi`/`Reservasi` ke constraint finance
- [x] Zod schemas `lib/validation/reservation.ts`: `createReservationSchema` (idempotencyKey, unitId, customerId, dpAmount, agreedPrice, isRefundable, expiresAt), `completeReservationSchema` (unitTest + paymentMethod Tunai/Transfer + channel + transactionDate + warrantyDays), `reservationIdSchema`
- [x] API `POST /api/reservations` — create_reservation RPC, Zod, idempotency, 201
- [x] API `POST /api/reservations/[id]/complete` — complete_reservation RPC, Zod, full F-SLS-02 test, 200 with invoice ID
- [x] API `POST /api/reservations/[id]/refund` — refund_reservation RPC, Owner gate 403, 200
- [x] API `POST /api/reservations/[id]/forfeit` — forfeit_reservation RPC, Admin/Owner, 200
- [x] API `POST /api/sales` — early guard reject `Dipesan` units
- [x] UI `reservation-section.tsx`: card Dipesan (info + Lunasi/Refund/Hangus), create form untuk Ready/Listed (customer select, dp, harga, refundable toggle, expiry picker), expiry overdue warning
- [x] UI `app/(dashboard)/reservations/page.tsx`: list reservasi filterable by status, desktop table + mobile cards
- [x] Nav items: `/reservations` untuk admin/owner (sidebar desktop, drawer mobile)
- [x] PGlite tests: `reservation-create.test.mjs` (create + status Dipesan + finance entry + idempotency + reject langsung sale + role gate teknisi), `reservation-complete.test.mjs` (Selesai + sale agreed_price + 3 finance net agreed_price + warranty + reject Cicilan + role gate), `reservation-resolve.test.mjs` (refund Owner → Dibatalkan + net 0 + gate admin + forfeit Hangus + no finance + P&L dp_hangus + gate teknisi), `reservation-guards.test.mjs` (expired reject + tetap terkunci + immutable terms + no warranty before completion)
- [ ] `npm run test:db` — **blokir pre-existing**: `initial-migration.test.mjs` gagal sebelum suite lain berjalan (bukan regresi reservasi). `npm run test:reservation` dan focused `sale-unit-test.test.mjs` lulus.
- [x] `npx tsc --noEmit --incremental false` — lulus 26 Juli 2026; TypeScript LSP tetap tidak terinstall tetapi bukan blocker typecheck CLI.
- [x] `npm run build` — production build lokal lulus 26 Juli 2026.
- [x] Migration `202607260001_dp_reservation.sql` deployed ke Supabase production — remote latest `202607260001`, REST schema probe `reservations` HTTP 200.
- [x] Deploy ke Vercel production — deployment `bj-stock-jdievwwlm-mobimku-1297s-projects.vercel.app` READY dan alias `https://bj-stock.vercel.app` aktif.
- [ ] Authenticated browser/visual QA — Playwright sengaja tidak dijalankan atas instruksi Owner; Owner akan menguji interface dan flow reservasi setelah deploy lalu memberi feedback.

👤 **Review interface**: kontrak PGlite reservasi, regresi F-SLS-02, typecheck, build, migration, deployment, dan HTTP smoke tanpa sesi sudah lulus. Owner perlu login dan menguji create → complete/refund/forfeit, overdue, role gate, serta tampilan 360px/390px/desktop; Playwright dilewati sesuai instruksi Owner.

---

## Catatan Keputusan Teknis
_(diisi berjalan, tambahkan entri baru di bawah dengan tanggal)_

- 2026-07-26 — **DP Reservation: idempotency lewat advisory lock + unique constraint, bukan application-level retry detection**: `idempotency_key` adalah UUID wajib dari client. RPC `create_reservation` mengunci `hashtext('reservation:' || p_idempotency_key::text)` via `pg_advisory_xact_lock`, lalu query existing; replay dengan data sama mengembalikan row yang sama, replay dengan data berbeda ditolak. Satu unit hanya boleh satu reservasi `Dipesan` aktif (partial unique index `reservations_active_unit_idx` di `id_unit WHERE status = 'Dipesan'`). Idempotency untuk refund/forfeit tidak perlu key terpisah karena aksi sudah dibatasi `for update` pada row reservasi.
- 2026-07-26 — **Completion reservasi memakai reversal DP + `create_sale` penuh, bukan jurnal sisa**: alih-alih membuat satu entri finance sebesar sisa pelunasan (+dp, −dp reversal, +full sale = net agreed_price penuh), pendekatan ini memastikan (1) warranty trigger existing tetap membaca `harga_jual = agreed_price` penuh, (2) revenue report dan P&L membaca `agreed_price` penuh dari `sales`, bukan nilai campuran dari dua tabel, (3) DP reversal memberi audit trail eksplisit bahwa DP sudah dibukukan dan dibatalkan. Revenue tercatat penuh dari `create_sale`, bukan dijumlah di aplikasi.
- 2026-07-26 — **Forfeit tidak membuat entri finance baru**: DP non-refundable sudah dicatat sebagai cash-in saat create. Forfeit hanya mengubah status reservasi ke `Hangus`; P&L membaca `reservations.dp_amount WHERE status = 'Hangus'` langsung dari tabel reservasi, bukan dari finance_transactions. Alasan: menghindari double-counting cash flow — uang sudah masuk saat create, keluar hanya saat refund reversal. Forfeit adalah pengakuan pendapatan yang tidak memindahkan uang.
- 2026-07-26 — **Unit tetap `Dipesan` saat overdue, tidak auto-resolve**: expiry hanya memblokir completion. Refund dan forfeit tetap tersedia untuk reservasi lewat batas. Keputusan desain: auto-resolve ke Hangus akan menghilangkan hak customer atas refund tanpa proses manual Owner — terlalu berisiko untuk bisnis ritel. Overdue tanpa auto-resolve memaksa admin/owner meninjau secara manual.
- 2026-07-26 — **Sumber trafik katalog memakai label pendek, bukan raw tracking**: sistem menyimpan UTM/referrer yang sudah diklasifikasi maksimal 48 karakter; tidak menyimpan raw URL, IP, user agent, lokasi, atau fingerprint. RPC 3-parameter yang sudah live dipertahankan saat overload 4-parameter ditambah agar deployment lama dan baru dapat coexist selama cutover tanpa downtime.
- 2026-07-23 — **Brand/model editable, id_unit fixed**: koreksi typo penamaan unit diizinkan Admin/Owner lewat Edit unit. Serial, modal_awal, sumber, tanggal, spek_awal tetap immutable. Tidak regenerate `id_unit` agar QR/histori invoice tetap valid.
- 2026-07-23 — **Backup source private GitHub**: repo `https://github.com/Mobimku/bj-stock`; deploy tetap Vercel CLI. Secret hanya di Vercel/Supabase env + `.env.local` lokal (gitignored).
- 2026-07-20 — **Resale setelah cancel**: UNIQUE `sales.id_unit` diganti partial unique (`status IS DISTINCT FROM 'Dibatalkan'`) agar cancel tidak memblokir penjualan ulang unit yang sama.
- 2026-07-20 — **Bank Stock harga vs finance**: restock mencatat finance lewat trigger `journal_part_restock`; edit harga tanpa restock harus koreksi finance (forward) + one-time fill gap historis (bukan rewrite restock lama).
- 2026-07-20 — **WhatsApp canonical `62…`**: validasi frontend normalisasi dulu (strip non-digit, 0/8→62) baru cek format; selaras dengan `normalize_whatsapp()` di DB.
- 2026-07-18 — **Foto unit rendered memakai optimizer bawaan Next/Vercel**: keputusan Fase 7.7 untuk `unoptimized` disupersede karena flag tersebut memaksa browser mengunduh file Supabase asli; tidak diperlukan Supabase Image Transformation. Card, Daftar, galeri, detail, thumbnail, dan lightbox sekarang memakai `/_next/image` dengan `srcset`/`sizes` sesuai footprint. URL OpenGraph tetap file asli agar crawler menerima URL publik stabil.
- 2026-07-16 — **Daftar Unit memakai Harga Listing sebagai harga utama tanpa menghilangkan Total Modal**: sort Termurah/Termahal membaca `units.harga_listing` dengan nilai null selalu terakhir; Card/List tetap menampilkan Total Modal sebagai informasi biaya internal. Card menjadi default, state `brand`/`status`/`sort`/`view` dimiliki URL, dan tidak ada client state/localStorage, migration, atau kalkulasi margin baru.
- 2026-07-15 — **Session refresh harus dapat menulis cookie**: `createServerClient` tidak boleh memakai `setAll` no-op pada Route Handler/Server Action. Server Component boleh gagal menulis dan fallback ke proxy, sehingga semua halaman authenticated wajib tercakup matcher proxy. API tidak dimasukkan matcher agar tetap mengembalikan JSON 401/403 sendiri; helper server memperbarui cookie langsung di API response.
- 2026-07-15 — **Downgrade part memakai trigger DELETE yang sudah ada**: tidak ditambah RPC/migration karena `adjust_upgrade_stock()` dan `recalculate_unit_modal()` sudah menangani pengembalian stok serta modal dalam transaksi database yang sama. Endpoint membatasi `id_part IS NOT NULL`; koreksi log jasa eksternal tetap tidak dibuka dari UI karena memiliki reversal Finance.
- 2026-07-15 — **Downgrade spek memakai nominal positif + discriminator, bukan biaya negatif**: `upgrade_log.biaya` tetap non-negatif; kolom `jenis` menentukan tanda pada formula modal. Ini membuat export/history mudah dibaca dan mencegah downgrade (`id_part NULL`) salah dianggap jasa eksternal oleh Finance. Pembuatan wajib melalui RPC atomik; part copotan tidak otomatis masuk Bank Stock.
- 2026-07-16 — **Desktop body lock harus scoped ke dashboard shell**: `body overflow:hidden` global merusak scroll route publik seperti katalog karena route tersebut tidak memiliki `.dashboard-content` sebagai pengganti scroller. Gunakan `body:has(.dashboard-shell)` pada breakpoint desktop; halaman publik kembali memakai document scroll alami sementara dashboard mempertahankan internal scroll.
- 2026-07-16 — **Grade tetap internal, katalog publik berorientasi harga**: RPC publik tidak lagi mengembalikan `kondisi_fisik`; filter harga memakai band diskrit dan sort terbaru/terlama memakai `updated_at`. Share tidak memakai dependency; Web Share API fallback ke clipboard. URL lokasi disimpan di `app_settings` agar Owner dapat mengubahnya tanpa deploy.
- 2026-07-15 — **Mobile window scroll, desktop internal scroll**: mobile tidak boleh memakai `body overflow:hidden` atau nested `dashboard-content overflow-y-auto`, karena perubahan visual viewport browser HP dapat memutus gesture scroll. Mulai `md`, shell kembali dikunci `h-screen` dan content scroll independen seperti kebutuhan desktop. Bottom nav mobile tetap fixed, tetapi shell menyediakan padding akhir yang sama dengan tinggi nav + safe-area.
- 2026-07-15 — **Sales dua langkah tetap satu transaksi**: pembagian hanya state UI dalam satu `<form>`; field langkah pertama tetap berada di DOM dan submit final tetap mengirim detail + snapshot F-SLS-02 bersama-sama ke `POST /api/sales`. Tidak ada draft, endpoint, atau status unit baru.
- 2026-07-15 — **Bottom navigation tidak overlay konten**: dashboard shell mereservasi `4rem + env(safe-area-inset-bottom)` dan mobile nav memakai tinggi yang sama. Konten tidak lagi scroll di belakang layer nav `fixed`.
- 2026-07-15 — **Akses snapshot test dan current-state Sales**: snapshot `sale_unit_tests` hanya dapat dibaca Admin/Owner; teknisi tetap dapat membuka detail Sales tanpa snapshot. `sales_current_state` tetap definer view agar completed return tersembunyi konsisten, tetapi wajib memfilter tiga role aplikasi secara eksplisit agar akun authenticated tanpa role tidak dapat membaca data.
- 2026-07-14 — **Read model dan pembatalan F-WRT-04**: `sales` tetap menjadi snapshot invoice asli, sedangkan daftar Sales, CRM, service prefill, dan laporan memakai `sales_current_state` untuk unit/nilai/margin/garansi aktif. `cancel_sale()` dipusatkan kembali sebagai RPC atomik Owner-only dan menolak invoice yang sudah memiliki event penggantian agar penggantian tidak dapat dibatalkan lewat jalur Cancel Sales biasa.
- 2026-07-14 — **Analytics katalog first-party anonim**: visitor diperkirakan lewat UUID acak di `localStorage`; deduplikasi berlaku per tanggal Jakarta + session + event + unit agar reload tidak menggandakan angka tetapi kunjungan hari berikutnya tetap tercatat. Role internal ditentukan dari JWT di RPC, bukan input browser. IP, user agent, fingerprint, lokasi, referrer, dan identitas customer tidak disimpan. Konsekuensi sadar: staf yang membuka incognito dihitung sebagai publik.
- 2026-07-12 — **Layout dashboard: scroll independen vs scroll window**: pilihan pakai `md:h-screen md:flex-row` + content area `overflow-y-auto min-h-0` (content scroll sendiri) instead of `min-h-screen` + `sticky` sidebar (window scroll). Alasan: (1) sidebar tidak perlu `sticky top-0` lagi — parent height locked jadi `md:h-screen` membuat sidebar kolom pertama mengisi tinggi penuh viewport; (2) sticky di window-scroll hanya bekerja parsial — saat window scroll, sidebar "sticky" tapi footer akun tidak dijamin posisinya (bisa terlihat di tengah kalau konten sidebar pendek); footer tetap di bawah wajib `mt-auto` pada flex-column; (3) content scroll mandiri vs window scroll — di desktop, lebih alami konten yang scroll daripada window (menghindari "flash" saat scroll lebar sidebar hijau bergerak walau sedikit). Bila nanti ada halaman dengan konten sangat panjang (mis. finance laporan) dan butuh anchor-link scroll-to-top otomatis, pertimbangkan `scroll-to-top` button di content area. Lihat Fase 7.9.
- 2026-07-12 — **Body `overflow: hidden`**: lock window scroll agar tidak ada "double scroll" (window + content area). Body `height: 100%` + `overflow: hidden`; html `height: 100%`. Tanpa lock, content area yang `overflow-y-auto` tetap window bisa ikut scroll bila content tidak cukup tinggi untuk trigger overflow-nya (default `min-h` di flex item bisa auto-grow). Trade-off: kalau ada elemen fixed/absolute yang berkaitan dengan window scroll (mis. modal tertentu yang butuh body scroll lock sendiri) — harus pakai `position: fixed` native `<dialog>` (sudah, semua modal pakai `<dialog showModal>` native → tidak terpengaruh body overflow lock). Lihat Fase 7.9.
- 2026-07-12 — **Sidebar `mt-auto` di footer akun**: sebelumnya footer di sidebar pakai `border-t border-white/15 p-4` saja — di flex-column, footer akan langsung menempel ke bawah nav items apabila konten sidebar pendek, tidak dijamin di bawah viewport. Tambah `mt-auto` (flex-column + `margin-top: auto`) → footer selalu push ke bawah sidebar walau nav items sedikit. Lazy fix — 1 class. Lihat Fase 7.9.
- 2026-07-13 — **Katalog Publik (Fase 9) — 3 RPC SECURITY DEFINER daripada public RLS**: pilih RPC `get_catalog_units()`, `get_catalog_unit(p_id_unit)`, `get_store_whatsapp_number()` — SECURITY DEFINER, eksplisit return field tertentu. Lebih aman daripada public RLS policy (tidak bisa SELECT kolom lain). Konsisten dengan pola `get_public_service`. Storage bucket `unit-photos` sudah PUBLIC (diverifikasi dari `next.config.ts` image whitelist dan `getPublicUrl`), tidak perlu signed URL.

- 2026-07-10 — `total_modal` disimpan sebagai kolom `numeric` dan selalu diisi trigger; bukan generated column, agar biaya upgrade dapat direcalculate sesuai catatan `SPEC.md` § 3.
- 2026-07-10 — Migration PostgreSQL diverifikasi dengan PGlite karena Docker tidak tersedia di mesin kerja.
- 2026-07-10 — Role aplikasi disimpan pada `auth.users.raw_app_meta_data.role` (`admin`/`teknisi`), sehingga hanya Admin API Supabase yang dapat mengubahnya dan RLS dapat membaca claim JWT.
- 2026-07-10 — Nomor unit memakai urutan global per bulan (default `FSD.md`) dengan `pg_advisory_xact_lock` untuk mencegah ID ganda saat request bersamaan.
- 2026-07-10 — Recalculation `total_modal` mengunci row unit sebelum menghitung agregat, sehingga Upgrade Log serentak tidak dapat menimpa total dengan snapshot lama.
- 2026-07-10 — Supabase Cloud dan Vercel production sudah terhubung; migration/seed serta build production berhasil di `https://bj-stock.vercel.app`.
- 2026-07-10 — Transaksi Sales dijalankan atomik melalui RPC dan trigger: unit dikunci, margin mengambil snapshot `total_modal`, status `Terjual` hanya dibuka selama trigger Sales, dan garansi 30 hari dibuat dalam transaksi yang sama.
- 2026-07-10 — ID invoice memakai urutan global per bulan `INV-YYMM-URUT3` dengan advisory lock; expiry garansi diperbarui on-the-fly saat lookup, bukan scheduled job.
- 2026-07-11 — **Feedback Owner**: keputusan 2026-07-10 "garansi 30 hari dibuat dalam transaksi yang sama" mengandung nilai hardcode yang seharusnya dapat dikonfigurasi (lihat Fase 2.1 — Patch: Garansi Dinamis). Bandingkan dengan `service_orders.garansi_servis_hari` yang sudah benar sejak Fase 3 dirancang (kolom per-baris dengan default, bukan literal di trigger). Prinsip umum ke depan: setiap durasi/nilai bisnis yang berpotensi berubah kebijakannya (garansi, biaya default, dsb.) harus jadi kolom/`app_settings`, tidak pernah literal di badan trigger atau kode.
- 2026-07-11 — **Feedback Owner (UI)**: nav bar hasil Fase 1 memanjang dan menu tidak terlihat di perangkat seluler. Root cause: `SPEC.md` sebelumnya tidak mendefinisikan pola navigasi mobile secara eksplisit — sudah ditambahkan sebagai `SPEC.md` §2.1. Lihat Fase 1.1 — Patch: Navigasi Responsif Mobile. Prinsip umum ke depan: karena NFR aplikasi ini mensyaratkan akses dominan lewat browser HP (`PRD.md` §5), setiap komponen UI baru wajib didesain mobile-first, diuji di viewport 360px/390px sebelum ditandai selesai — bukan didesain untuk desktop lalu "disempitkan" belakangan.
- 2026-07-11 — **Feedback Owner (Data)**: unit berstatus `Listed` tidak punya field harga listing — hanya `sales.harga_jual` yang terisi saat closing. Ditambahkan `units.harga_listing` (lihat Fase 1.2 — Patch: Harga Listing pada Unit). `harga_listing` dan `harga_jual` sengaja dipisah: yang pertama harga tawar di konten, yang kedua harga final hasil nego — margin selalu dari `harga_jual`.
- 2026-07-11 — Rekonsiliasi checklist: seluruh task Fase 3 dan Fase 4 diverifikasi ulang dari migration `202607110001`/`202607110002`, route/UI, test E2E, lint, build, dan riwayat migration cloud; checkbox dikembalikan ke `[x]`. Patch 1.1, 1.2, dan 2.1 tetap belum selesai.
- 2026-07-11 — Finance memakai ledger immutable dan mutasi RPC-only; payment wajib membawa event key idempotent, reversal payment mengoreksi saldo piutang, dan refund tidak boleh melebihi kas yang sudah diterima. Semua ringkasan uang pada halaman Finance dihitung di function PostgreSQL, bukan frontend.
- 2026-07-11 — **Feedback Owner (Delisting)**: unit yang sudah di-input tidak bisa diedit/dihapus — ini gap karena kesalahan input pasti terjadi dan unit bisa rusak/hilang/retur supplier. Ditambahkan status `Delisted` (F-STK-04) dengan 4 skenario: rusak parah (tanpa reversal), retur supplier (reversal finance penuh), salah input (hard delete + reversal), hilang (tanpa reversal). Reactivate tersedia untuk kasus jarang (unit ditemukan kembali). Unit tidak pernah dihapus kecuali skenario `salah_input`.
- 2026-07-12 — **Vercel binary corruption**: upload foto via server-side `supabase.storage.upload()` di runtime Vercel Node 20 mengkorupsi byte binary (`ef bf bd` / U+FFFD di header RIFF), file WebP tersimpan rusak. Tidak terjadi di lokal (Node 22, Windows). Solusi: **signed URL flow** — server generate `createSignedUploadUrl`, client browser `PUT` binary langsung ke Supabase Storage, melewati serverless body handling. Pipeline `sharp` server-side dihapus; klien upload raw file (≤5MB, max 4/unit). Lihat Fase 7.6.
- 2026-07-12 — `POST /api/units` berubah dari FormData (multipart) ke JSON — untuk menghilangkan ketergantungan pada Vercel `request.formData()` binary handling. Foto unit ditambahkan terpisah via `POST /api/units/[id]/photos` → `PUT /api/units/[id]/photos` setelah unit dibuat. Argumen RPC `create_unit` dengan nilai `undefined` perlu di-coerce ke `null` sebelum dikirim (PostgREST butuh semua parameter eksplisit, `undefined` key dihilangkan oleh JSON.stringify → cache miss PGRST202).
- 2026-07-12 — **Galeri foto & lightbox native `<dialog>`**: pilihan pakai `<dialog>` + `showModal()` (HTML spec) daripada lib lightbox (react-photoswipe et al). Alasan: (1) stdlib DOM — nol dependency tambahan, ringan; (2) native backdrop + scroll lock + focus trap built-in; (3) a11y otomatis (Expressi dialog). Trade-off: styling `<dialog>` default browser minimal — perlu kelas Tailwind sendiri (background, padding, backdrop dimming). Keyboard ←/→ + Esc di-handle dengan `window.addEventListener`. Lihat Fase 7.7.
- 2026-07-12 — **HP-friendly delete pattern**: tombol hapus foto selalu visible di mobile (`opacity-100`), `group-hover` hanya aktif di desktop (`sm:` prefix). Alternatif lain: `long-press` pattern — ditolak karena (1) bukan konvensi di galeri admin app; (2) perlu timer + cancel-on-scroll logic yang tidak trivial; (3) tidak punya affordance visual yang jelas (user tidak tahu bisa long-press). Always-visible tombol hapus lebih sederhana dan lebih discoverable; augend (clutter visual) minimal karena max 4 foto. Lihat Fase 7.7.
- 2026-07-12 — `next/image` dipakai untuk thumb galeri + lightbox dengan prop `unoptimized` — karena Supabase Storage Free plan tidak menyediakan Image Transformation API (butuh Pro plan). Walau begitu, `next/image` masih bermanfaat untuk: (1) lazy loading otomatis dan mencegah CLS karena `width`/`height` eksplisit; (2) `sizes` untuk hints ke browser; (3) konsistensi dengan `next/image` di halaman receipt lain. Domain Supabase di-whitelist di `next.config.ts` `images.remotePatterns`. Lihat Fase 7.7.
- 2026-07-12 — **Edit spek opsi B (`spek_awal` frozen + history table)**: keputusan user untuk Fase 7.8. Alih-alih overwrite `spek_awal` saat edit + insert row history backup (opsi A), `spek_awal` di kolom `units` tetap frozen (read-only setelah create) sebagai snapshot statis spek awal unit. Perubahan dikumulatif di `spek_saat_ini` (kolom live, edit-able) + audit trail di `unit_spec_history`. Alasan: (1) backward-compatible — semua kode yang membaca `spek_awal` sebelumnya tetap valid; (2) `spek_saat_ini` menjadi single source of truth untuk spek *saat ini*, `spek_awal` snapshot statis untuk perbandingan cepat; (3) tidak ada risiko trigger INSERT row awal yang tertimpa. Field `serial_number`/`sumber_beli`/`modal_awal`/`tanggal_masuk` tetap **immutable** setelah create. **Update 2026-07-23**: `brand`/`model` boleh dikoreksi Admin/Owner (typo) tanpa ubah `id_unit` — lihat patch pasca-restore.
- 2026-07-12 — **Stricter delist menolak service order aktif**: RPC `delist_unit` sekarang cek `count(*) FROM service_orders WHERE id_unit=$1 AND status IN ('Diterima','Diagnosa','Dikerjakan')`. Bila > 0 → raise exception. Alasan: (1) Protect FK integrity — `service_orders.id_unit` punya `ON DELETE RESTRICT` default (Postgres), menghapus unit akan gagal di FK constraint; (2) UX lebih baik — pesan error tertulis jelas "selesaikan/batalkan servis dulu" alih-alih mysterious FK violation di log; (3) Mencegah ghost service yang technician tidak bisa diakses lagi (status service merujuk unit yang tidak ada). Catatan: skenario `salah_input` (hard delete) tetap dijalankan bila cek service order aktif lulus — service order `Selesai`/`Diambil` tidak block. Lihat Fase 7.8.
- 2026-07-12 — **Modal native `<dialog>` untuk edit & delist**: pilihan pakai `<dialog>` + `showModal()`/`close()` untuk semua modal Fase 7.8 (edit spek, delist, lightbox di 7.7) — konsisten dengan pola Fase 7.7. Alasan sama dengan lightbox: stdlib DOM, nol dependency, native backdrop + focus trap + scroll lock. Trade-off: styling harus Tailwind-class sendiri (`p-6 rounded-xl bg-white w-full max-w-md` + backdrop `::backdrop` bila perlu). Lihat Fase 7.8.
- 2026-07-12 — **Trigger spec history pakai `IS DISTINCT FROM`**: comparison `IS DISTINCT FROM` di PostgreSQL handle NULL dengan benar (NULL IS DISTINCT FROM NULL = false, NULL IS DISTINCT FROM 'foo' = true), berbeda dari `=` yang NULL-safe tidak. Trigger `AFTER UPDATE OF spek_saat_ini, kondisi_fisik, kondisi_fungsi` deze cases dimana satu field berubah sementara yang lain tetap — insert satu row history baru (bukan per-field). Catatan: bila tidak ada field yang berubah, trigger short-circuit (`return NEW`) tanpa insert, jadi no-op edit tetap 200 OK. Lihat Fase 7.8.
- 2026-07-12 — **Feedback Owner (Role & Akses)**: sistem sebelumnya cuma punya 2 role (`admin`/`teknisi`) — artinya semua Admin bisa reversal Finance dan proses Retur unit `Terjual` tanpa batas, dan tidak ada UI untuk manajemen akun/`app_settings` (cuma bisa lewat SQL manual). Ditambahkan role `owner` (superset Admin) dengan 2 aksi eksklusif (reversal Finance, Retur) + Modul 10 (manajemen akun, pengaturan aplikasi, log aktivitas). Keputusan desain eksplisit: **role tetap 3 tingkat, bukan permission matrix granular** — lihat `AGENTS.md` §11 untuk alasan. Lihat Fase 8.
- 2026-07-12 — **Bootstrap role owner**: karena `require_owner()` RPC butuh owner yang sudah ada untuk membuat owner lain, akun Admin pertama (Sidiq) di-promote ke `owner` lewat Supabase Admin API/dashboard secara manual — bukan via RPC, bukan bagian dari migration otomatis. Ini one-time step yang harus diulang manual kalau environment/project Supabase di-reset dari nol.
- 2026-07-12 — **Rekonsiliasi dokumen — Fase 9 (Katalog) sempat hilang**: draft Fase 9 sebelumnya sempat ditulis tapi tidak pernah masuk ke `TODO.md`/`FSD.md` yang benar-benar dipakai agent (kemungkinan tertimpa saat siklus Fase 8/8.1/8.2 berjalan cepat). Ditulis ulang dari kondisi real per `HANDOFF.md` 12 Juli 2026, bukan dari draft lama. Pelajaran: untuk proyek yang jalan cepat multi-sesi, **selalu minta `HANDOFF.md` + `TODO.md` terbaru sebelum menulis fase baru**, jangan andalkan draft yang ditulis di sesi sebelumnya tanpa verifikasi ulang — dokumen sumber kebenaran adalah yang ada di repo, bukan yang terakhir dikirim di chat.

## Blocker / Pertanyaan Terbuka
_(diisi jika ada hal yang butuh keputusan Owner sebelum lanjut)_

- 2026-07-10 — Perlu konfirmasi Owner: `SPEC.md` menetapkan `serial_number` unik global, sedangkan `FSD.md` menyebut duplikat hanya dilarang untuk unit aktif. Implementasi saat ini mengikuti `SPEC.md`, jadi serial unit berstatus `Selesai` tetap tidak dapat didaftarkan ulang.
- 2026-07-11 — Review interface Fase 5 tertunda: buka `/finance` sebagai admin pada viewport 360px dan 390px, jalankan seluruh form, lalu login sebagai teknisi dan pastikan menu, halaman, serta `POST /api/finance` ditolak. Verifikasi otomatis DB/lint/build sudah lulus.
- 2026-07-12 — ~~Perlu konfirmasi Owner sebelum eksekusi~~ **Resolved**: akun Owner sudah dikonfirmasi & dibuat — email `mobimku@gmail.com`. Password diset langsung oleh Owner di Supabase Dashboard, tidak pernah dikirim/dicatat lewat dokumen atau chat log yang ter-commit. Agent dapat lanjut ke sisa task Fase 8 dengan asumsi akun ini sudah aktif dengan role `owner`.

## Catatan Brand

- 2026-07-10 — Warna resmi: primary `#198929`, secondary `#FF751F`, accent `#FFDC50`.
- 2026-07-10 — Aset logo hitam, putih, dan vektor disimpan bersama `BRAND_GUIDE.md`; implementasi token UI dilakukan pada fase polish atau task styling terpisah.
