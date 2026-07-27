# SPEC.md — Technical Specification
## BJ Stock
v1.0 · Juli 2026

Dokumen ini adalah single source of truth teknis untuk AI coding agent (OpenCode + Sonnet 4.5). Baca ulang file ini di setiap sesi baru sebelum melanjutkan development.

---

## 1. Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage)
- **QR Generate**: library `qrcode`
- **QR Scan**: browser camera via `@zxing/browser` atau `html5-qrcode`
- **Hosting**: Vercel (frontend) + Supabase Cloud
- **Auth**: Supabase Auth, role-based (`owner`, `admin`, `teknisi` — disimpan di `auth.users.raw_app_meta_data.role`); halaman publik servis tanpa auth (akses via token/slug di URL). `owner` adalah superset `admin` di RLS manapun yang mengizinkan `admin`, ditambah akses eksklusif ke manajemen akun, `app_settings`, dan dua aksi Finance terbatas (reversal & Retur) — lihat `FSD.md` §2.9.

## 2. Struktur Folder (usulan)

```
bjstock/
├── SPEC.md
├── AGENTS.md
├── TODO.md
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── units/            # Modul Stock
│   │   ├── bank-stock/       # Modul Bank Stock
│   │   ├── sales/            # Modul Sales
│   │   ├── warranty/         # Modul Aftersales
│   │   ├── service/          # Modul Servis
│   │   ├── customers/        # Modul CRM
│   │   ├── settings/         # Modul 10: Manajemen Akun, Pengaturan, Log Aktivitas (Owner only)
│   │   └── reports/          # Modul Dashboard (fase akhir)
│   ├── scan/                 # Halaman scan QR umum
│   └── katalog/               # Modul 11: katalog publik (F-CAT-01/02), tanpa auth, tanpa sidebar admin
│       └── [id_unit]/
│   └── s/[id_servis]/        # Halaman publik cek status servis
├── lib/
│   ├── supabase/
│   └── qr/
├── components/
│   ├── nav/                   # AppSidebar (desktop), MobileNav (bottom tab), MobileDrawer (menu penuh)
└── supabase/
    └── migrations/
```

## 2.1 Pola Navigasi Responsif (wajib, bukan opsional)

Admin/teknisi mengakses aplikasi ini dominan dari **browser HP** (dipakai buat scan QR kamera — lihat `PRD.md` §5 NFR Aksesibilitas). Nav bar **tidak boleh** berupa satu baris menu horizontal statis yang cuma "menyempit" di layar kecil — itu menyebabkan overflow atau menu hilang/ke-scroll, seperti yang terjadi di implementasi saat ini.

**Breakpoint** (mengikuti default Tailwind): `md` = 768px.

| Lebar layar | Pola navigasi |
|---|---|
| `< 768px` (mobile) | **Bottom tab bar** untuk 4–5 menu paling sering dipakai (Scan, Unit, Sales, Servis, lainnya masuk ke ikon "More") + **Drawer/hamburger** dari header untuk akses semua menu termasuk CRM, Finance, Laporan |
| `≥ 768px` (tablet/desktop) | **Sidebar** tetap terlihat di kiri, seluruh menu tampil sebagai list vertikal |

**Aturan wajib:**
- Item menu ditentukan per role: Admin lihat semua, Teknisi cuma lihat Servis/Upgrade Log (selaras `FSD.md` §1) — jangan render item yang role itu tidak boleh akses, walau cuma disembunyikan lewat CSS.
- Bottom tab bar mobile **maksimal 5 ikon** (termasuk "More"), karena lebih dari itu ikon jadi terlalu kecil buat di-tap di layar HP. Tingginya wajib direservasi oleh dashboard shell; nav `fixed` tidak boleh menutup tombol atau isi halaman.
- Container nav wajib `overflow-x-hidden` di semua breakpoint — kalau ada elemen yang bikin nav melebar, itu bug yang harus diperbaiki di layout, bukan ditutup dengan scroll horizontal.
- Halaman publik servis (`/s/[id_servis]`) **tidak** memakai sidebar/bottom-nav admin sama sekali — halaman itu berdiri sendiri tanpa navigasi aplikasi.
- Uji manual wajib dilakukan di lebar viewport 360px dan 390px (ukuran umum Android/iPhone), bukan cuma di desktop dengan devtools di-resize sekilas.

## 3. Skema Database (DDL Referensi)

```sql
-- UNIT
create table units (
  id_unit text primary key,               -- BJ-HP-2607-001
  brand text not null,
  model text,
  serial_number text unique,
  spek_awal text,
  spek_saat_ini text,
  kondisi_fisik text check (kondisi_fisik in ('A','B','C')),
  kondisi_fungsi text,
  sumber_beli text,
  modal_awal numeric not null check (modal_awal > 0),
  total_modal numeric generated always as (modal_awal) stored, -- override via trigger, lihat catatan
  harga_listing numeric check (harga_listing > 0),  -- harga yang dipasang di konten/marketplace saat status = Listed; TERPISAH dari sales.harga_jual (harga final hasil nego saat closing)
  status text not null default 'Masuk'
    check (status in ('Masuk','QC','Ready','Listed','Dipesan','Terjual','Selesai','Delisted')),
  tanggal_masuk date not null default current_date,
  foto_url text[],
  qr_payload text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- Catatan: total_modal TIDAK boleh generated column statis karena harus dijumlah
-- dengan upgrade_log. Gunakan trigger AFTER INSERT/UPDATE/DELETE pada upgrade_log
-- untuk recalculate total_modal = modal_awal
--   + SUM(part/jasa) - SUM(downgrade).

-- BANK STOCK
create table bank_stock (
  id_part text primary key,                -- BS-RAM-001
  jenis_part text not null,
  kondisi text check (kondisi in ('New','Copotan')),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  modal_per_unit numeric not null,
  sumber text,
  created_at timestamptz default now()
);

-- UPGRADE LOG (relasi Unit <-> Part)
create table upgrade_log (
  id_log uuid primary key default gen_random_uuid(),
  id_unit text references units(id_unit),
  id_part text references bank_stock(id_part),  -- nullable jika jasa/downgrade
  jenis text not null check (jenis in ('part','service','downgrade')),
  biaya numeric not null,
  spek_setelah text,                            -- wajib untuk downgrade
  tanggal date default current_date,
  catatan text
);

-- CUSTOMER (CRM)
create table customers (
  id_customer uuid primary key default gen_random_uuid(),
  nama text not null,
  kontak_wa text unique,
  segmen text check (segmen in ('Pelajar','Orang Tua','Remote Worker','Lainnya')),
  sumber_lead text check (sumber_lead in ('TikTok','Reels','Instagram','Facebook Marketplace','WA','Referral','Lainnya')),
  created_at timestamptz default now()
);

-- SALES
create table sales (
  id_invoice text primary key,             -- INV-2607-001
  id_unit text unique references units(id_unit),
  id_customer uuid references customers(id_customer),
  harga_jual numeric not null check (harga_jual > 0),
  margin numeric,                          -- dihitung via trigger: harga_jual - total_modal
  channel text check (channel in ('Offline','Marketplace','Instagram','TikTok','WA')),
  metode_bayar text check (metode_bayar in ('Tunai','Transfer','Cicilan')),
  durasi_garansi_hari integer not null default 30,  -- prefill dari app_settings, admin bisa override per transaksi
  tanggal_transaksi date default current_date
);

-- APP SETTINGS (nilai konfigurasi global, agar tidak ada angka hardcode di trigger/kode)
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
insert into app_settings (key, value) values
  ('default_warranty_unit_days', '30'),
  ('default_warranty_service_days', '7'),
  ('replacement_grace_days', '7'),
  ('stock_aging_alert_days', '30'),
  ('store_whatsapp_number', ''),  -- format 62xxxxxxxxxx; kosong = tombol WA katalog disabled
  ('store_google_maps_url', '');  -- URL HTTPS yang diisi Owner; kosong = tombol Lokasi disabled
-- Catatan: F-WRT-01 WAJIB baca sales.durasi_garansi_hari untuk hitung tanggal_berakhir,
-- BUKAN literal angka di badan trigger. app_settings dipakai untuk prefill form saat
-- transaksi dibuat, bukan dibaca ulang oleh trigger garansi itu sendiri (supaya garansi
-- yang sudah terbentuk tidak berubah kalau setting default diubah belakangan).

-- CATALOG ANALYTICS (anonim, tanpa IP/fingerprint/identitas customer)
create table catalog_events (
  id_event uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('catalog_view','detail_view','whatsapp_click','share_click')),
  session_id uuid not null,
  id_unit text references units(id_unit) on update cascade on delete set null,
  is_internal boolean not null,
  occurred_at timestamptz not null default now(),
  event_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  check (
    (event_type = 'catalog_view' and id_unit is null)
    or (event_type in ('detail_view','whatsapp_click','share_click') and id_unit is not null)
  )
);
-- `share_click` dicatat saat tombol Bagikan ditekan, sebelum native share/clipboard dicoba.
-- Pembatalan share sheet atau kegagalan clipboard tetap dihitung sebagai klik; event ini bukan
-- bukti link terkirim karena browser tidak menyediakan callback yang dapat diverifikasi server.
-- RLS aktif tanpa policy direct table. Write hanya lewat record_catalog_event(),
-- yang menentukan is_internal dari JWT server-side. Laporan agregat hanya Admin/Owner.

-- WARRANTY (Garansi)
create table warranty (
  id_garansi uuid primary key default gen_random_uuid(),
  id_unit text references units(id_unit),
  tanggal_mulai date not null,
  tanggal_berakhir date not null,          -- = tanggal_mulai + sales.durasi_garansi_hari (bukan +30 hardcode)
  status text default 'Aktif' check (status in ('Aktif','Habis'))
);

-- WARRANTY CLAIM
create table warranty_claim (
  id_klaim uuid primary key default gen_random_uuid(),
  id_garansi uuid references warranty(id_garansi),
  tanggal date default current_date,
  keluhan text,
  tindakan text,
  biaya numeric default 0
);

-- WARRANTY UNIT REPLACEMENT (F-WRT-04, append-only)
create table warranty_replacements (
  id_replacement uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  id_invoice text not null references sales(id_invoice),
  sequence_no integer not null check (sequence_no > 0),
  id_klaim uuid not null unique references warranty_claim(id_klaim),
  old_unit_id text not null unique references units(id_unit),
  replacement_unit_id text not null unique references units(id_unit),
  old_warranty_id uuid not null unique references warranty(id_garansi),
  new_warranty_id uuid not null unique references warranty(id_garansi),
  replacement_date date not null,
  grace_days integer not null check (grace_days > 0),
  previous_transaction_value numeric not null check (previous_transaction_value > 0),
  replacement_transaction_value numeric not null check (replacement_transaction_value > 0),
  price_difference numeric generated always as (replacement_transaction_value - previous_transaction_value) stored,
  replacement_unit_modal numeric not null check (replacement_unit_modal > 0),
  adjusted_margin numeric generated always as (replacement_transaction_value - replacement_unit_modal) stored,
  id_account uuid references finance_accounts(id_account),
  id_finance_transaction uuid unique references finance_transactions(id_transaksi),
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id_invoice, sequence_no),
  check (old_unit_id <> replacement_unit_id),
  check ((price_difference = 0 and id_account is null and id_finance_transaction is null)
    or (price_difference <> 0 and id_account is not null and id_finance_transaction is not null))
);
-- sales.id_unit/harga_jual/margin tetap snapshot transaksi asli. View sales_current_state
-- memilih replacement sequence terbaru untuk unit, nilai transaksi, margin, dan garansi aktif.
-- Invoice yang sudah memiliki warranty_replacements tidak boleh diproses lewat Cancel Sales
-- maupun Retur; trigger pada returns menegakkan larangan Retur di level database.

-- SERVICE ORDER (Modul 6)
create table service_orders (
  id_servis text primary key,              -- SVC-2607-001
  id_unit text references units(id_unit),  -- nullable: null jika servis umum (customer luar)
  id_customer uuid references customers(id_customer),
  jenis_servis text check (jenis_servis in ('Repair','Install','Cleaning')),
  brand_model text,                        -- diisi manual jika id_unit null
  keluhan text,
  diagnosa text,
  tindakan text,
  biaya_jasa numeric default 0,
  biaya_part numeric default 0,            -- dihitung via trigger dari service_part_log
  total_biaya numeric generated always as (biaya_jasa + biaya_part) stored,
  status text default 'Diterima'
    check (status in ('Diterima','Diagnosa','Dikerjakan','Selesai','Diambil')),
  garansi_servis_hari integer default 7,
  tanggal_masuk date default current_date,
  tanggal_selesai date,
  qr_payload text
);

-- SERVICE PART LOG (relasi Servis <-> Part)
create table service_part_log (
  id_log uuid primary key default gen_random_uuid(),
  id_servis text references service_orders(id_servis),
  id_part text references bank_stock(id_part),
  biaya numeric not null,
  tanggal date default current_date
);
```

### Trigger status unit yang wajib ada

`enforce_unit_status_transition` pada `BEFORE UPDATE OF status ON units` mengizinkan transisi linear. Sejak Reservasi (F-RSV) ditambahkan, transisi mencakup:

```
Masuk → QC → Ready → Listed → Terjual → Selesai
              │       │
              └──┬────┘
                 ↓ create reservation
              Dipesan ──→ Terjual (completion)
                 └──────→ previous_status: Ready/Listed (refund/forfeit)
Ready/Listed → Delisted
Delisted → Ready (reactivate)
Terjual → Ready (retur/Cancel Sales)
Terjual → QC (warranty replacement)
```

`Dibatalkan` dan `Hangus` adalah status `reservations`, bukan nilai `units.status`. Refund/forfeit mengembalikan unit dari `Dipesan` ke `previous_status` (`Ready`/`Listed`).

Flag transaksi (`app.sales_flow`, `app.reservation_flow`, `app.delist_flow`, `app.reactivate_flow`, `app.warranty_replacement_flow`, `app.returns_flow`) dipakai sebagai transaction-local gate agar hanya alur yang sah yang dapat mengubah status.

### Trigger lain yang wajib dibuat (bukan opsional)
1. `AFTER INSERT/UPDATE/DELETE ON upgrade_log` → recalculate `units.total_modal` dengan `part/service` sebagai penambah dan `downgrade` sebagai pengurang.
2. `AFTER INSERT ON upgrade_log / service_part_log` → decrement `bank_stock.stock_qty`.
3. `AFTER INSERT ON sales` → set `units.status = 'Terjual'`, insert `warranty` row dengan `tanggal_berakhir = tanggal_mulai + sales.durasi_garansi_hari` (bukan angka hardcode), calculate `margin`.
4. `AFTER INSERT/UPDATE ON service_part_log` → recalculate `service_orders.biaya_part`.
5. `AFTER UPDATE ON service_orders (status → 'Diambil')` → insert/refresh warranty record khusus servis jika diperlukan.
6. `AFTER INSERT ON units` → insert row pertama ke `unit_spec_history` (snapshot spek awal, catatan "Spek awal saat unit dibuat").
7. `AFTER UPDATE OF spek_saat_ini, kondisi_fisik, kondisi_fungsi ON units` → insert row baru ke `unit_spec_history` bila satu saja field berubah. Trigger pakai `IS DISTINCT FROM` (handle NULL).

## 3.2 Storage Supabase & Foto Unit

Bucket Storage: `unit-photos` (public read). Path format: `${id_unit}/${uuid}.${ext}`.

**Constraint (di-enforce di API route, bukan DB):**
- Maksimal **4 foto per unit** (array `units.foto_url`).
- Maksimal **5 MB per file**; tipe yang diizinkan: `image/jpeg`, `image/png`, `image/webp`.
- Hanya admin yang boleh upload/hapus foto; teknisi hanya lihat.
- RLS bucket `unit-photos`: role `authenticated` dapat SELECT/INSERT/UPDATE/DELETE — batasan role di-enforce di API route (cek `app_metadata.role === "admin"`), bukan di RLS.

**Alur upload (signed URL flow — lihat Fase 7.6 untuk alasan kenapa tidak server-side upload):**
1. Client `POST /api/units/[id]/photos` dengan `{ count, fileExt }` → server validasi slot (< 4), generate signed upload URLs lewat `createSignedUploadUrl`, return `{ uploads: [{ signedUrl, path, token }] }`.
2. Client browser `PUT` binary langsung ke `signedUrl` (melewati server Vercel — menhindari binary corruption di serverless runtime).
3. Client `PUT /api/units/[id]/photos` dengan `{ paths }` → server validasi prefix path `${id_unit}/`, cek total ≤ 4, ambil public URL, update `units.foto_url`.

**Storage URL yang disimpan di `foto_url`:** public URL (`${SUPABASE_URL}/storage/v1/object/public/unit-photos/<path>`) — tidak ada expiry. URL disimpan sebagai `text[]` di kolom `units.foto_url`.

**Tampilan foto di halaman detail unit (`/units/[id]`):**
- Grid 2-kolom di mobile (< 640px), 3-kolom di ≥ 640px.
- Each thumb: `aspect-[4/3]`, `object-cover`, pakai `next/image` (di-whitelist di `next.config.ts images.remotePatterns`).
- Klik thumb → buka lightbox (native `<dialog>` full-viewport, scroll lock, navigasi prev/next + keyboard ←/→ + Esc).
- Indikator posisi (mis. "1/4") tampil bila foto > 1.
- Tombol hapus: admin-only, selalu visible di mobile (HP-friendly), `group-hover` di desktop.
- Teknisi/user non-admin: gallery read-only tanpa tombol hapus, lightbox tetap bisa dibuka.

**Edge case:**
- Bila `foto_url` kosong/null → section gallery tidak dirender.
- Bila file di Storage hilang/dihapus eksternal (broken URL), `next/image` menampilkan alt text — tidak ada broken-icon.

## 3.3 Riwayat Spesifikasi Unit (`unit_spec_history`)

Tabel audit trail untuk perubahan spek & kondisi unit. Schema:

```sql
create table unit_spec_history (
  id_history uuid primary key default gen_random_uuid(),
  id_unit text not null references units(id_unit) on delete cascade,
  spek_saat_ini text,
  kondisi_fisik text check (kondisi_fisik in ('A','B','C')),
  kondisi_fungsi text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  catatan text
);
```

**Aturan:**
- Trigger insert row saat `INSERT` pertama kali (snapshot awal) + saat `UPDATE` field `spek_saat_ini`/`kondisi_fisik`/`kondisi_fungsi` berubah (lihat Trigger 6/7).
- **`spek_awal`** di kolom `units` adalah snapshot statis dari spek saat unit pertama dibuat, hanya bisa diisi oleh RPC `create_unit`, **read-only** lewat `PATCH /api/units/[id]` — tidak bisa diubah setelah create. Untuk audit lengkap, query `unit_spec_history` dengan `catatan = 'Spek awal saat unit dibuat'` untuk menampilkan row pertama.
- **Edit form** di detail unit hanya boleh edit `spek_saat_ini`, `kondisi_fisik`, `kondisi_fungsi` (keputusan fase 7.8). Field `brand`, `model`, `serial_number`, `sumber_beli`, `modal_awal`, `tanggal_masuk` tidak bisa diubah setelah create — typo fix bisa pakai delist `salah_input` (hard delete) + re-create.
- **Tampilan**: section "Spesifikasi" di `/units/[id]` memuat dua field "Spesifikasi saat ini" (current, untuk baca) dan "Spek awal (snapshot)" (snapshot statis untuk perbandingan cepat), plus expandable "Riwayat perubahan spesifikasi" yang fetch `unit_spec_history` dengan timeline vertikal.
- **Modal edit**: aksi edit dipanggil dari tombol "Edit spek & kondisi" (outline amber) → buka native `<dialog>` modal dengan 3 field + cancel + save. Bila spek/kondisi tidak ada perubahan dari current state, user boleh klik Save (no-op insert trigger tidak akan eksekusi karena tidak ada field yang distinct).

## 3.4 Stricter Delisting — Pembatasan Tambahan

Selain syarat eksisting `status ∈ {Ready, Listed}`, RPC `delist_unit` memiliki validasi tambahan sejak Fase 7.8:

- **Block bila ada service order aktif**: `select count(*) from service_orders where id_unit = $1 and status in ('Diterima', 'Diagnosa', 'Dikerjakan')`. Bila count > 0 → raise exception "Unit tidak dapat delist karena masih ada N service order aktif. Selesaikan atau batalkan servis terlebih dahulu." Designed untuk mencegah delist unit yang sedang dalam perbaikan teknisi — unit dihapus dari sistem akan orphan service_order yang baik (FK dengan `on delete restrict` default untuk `service_orders.id_unit`).
- **Catatan**: skenario `salah_input` hard delete tetap menghapus row unit. Tapi cek service order aktif berjalan sebelum delete — Kalau ada service order non-final, delist ditolak. Service order final (`Selesai`/`Diambil`) tidak menghalangi delist.

## 3.5 Pre-Payment Unit Testing (F-SLS-02)

Satu record `sale_unit_tests` per transaksi jual, bukan per-kategori. Hasil 12 kategori dan blocking checks disimpan sebagai JSONB. Test dan sale bersifat atomik melalui RPC `create_sale(p_test jsonb)` — tidak ada endpoint atau draft terpisah. Setelah sale dikonfirmasi, row test menjadi immutable.

```sql
create table sale_unit_tests (
  id_sale_test uuid primary key default gen_random_uuid(),
  id_unit text not null references units(id_unit),
  test_results jsonb not null,
  blocking_checks jsonb not null,
  location text not null,
  tester_user_id uuid not null,
  tester_email text not null,
  acknowledgement_text text not null,
  confirmed_at timestamptz not null default now()
);
```

**Kolom tambahan pada `sales` (via migration):**
```sql
alter table sales add column id_sale_test uuid;
alter table sales add constraint fk_sales_unit_test_unit foreign key (id_sale_test, id_unit) references sale_unit_tests(id_sale_test, id_unit);
create unique index idx_sales_id_sale_test on sales(id_sale_test) where id_sale_test is not null;
```
- `sales.id_sale_test` nullable hanya untuk baris historis (sebelum fitur ini ada).
- Composite FK `(id_unit, id_sale_test)` memastikan unit di sale sesuai unit di test.
- Unique partial index (`WHERE id_sale_test IS NOT NULL`) = consumption guard: satu test hanya bisa dipakai oleh satu sale.

**JSONB `test_results` (12 key):**
```
{
  "identity_spec_serial":                { "status": "Lulus"|"Ada Catatan"|"Tidak Diuji", "note": "..." },
  "physical_casing_hinges":              { ... },
  "display_dead_pixels":                 { ... },
  "keyboard_touchpad":                   { ... },
  "wifi_bluetooth":                      { ... },
  "av_devices":                          { ... },
  "usb_ports":                           { ... },
  "display_output":                      { ... },
  "battery_charging_charger":            { ... },
  "storage_health":                      { ... },
  "boot_os_locks":                       { ... },
  "included_accessories":                { ... }
}
```

**JSONB `blocking_checks` (7 boolean, hasil evaluasi dari `test_results`):**
```
{
  "identity_mismatch": false,
  "serial_mismatch":   false,
  "spec_mismatch":     false,
  "swollen_battery":   false,
  "bios_lock":         false,
  "mdm_lock":          false,
  "unsafe_charger":    false
}
```

**Integrasi:**
- **Immutable trigger** (`BEFORE UPDATE OR DELETE ON sale_unit_tests`): seluruh row bersifat final karena hanya dibuat bersama transaksi; update/delete selalu ditolak.
- **Sales insert gate** (`AFTER INSERT ON sales`): verifikasi `sale_unit_tests.confirmed_at IS NOT NULL` untuk `id_sale_test` yang dirujuk; tolak insert bila test belum dikonfirmasi (fail-safe).
- **RLS**: `sale_unit_tests` — SELECT untuk admin/owner; INSERT hanya lewat RPC `create_sale` (security definer). Tidak ada akses langsung dari client.
- **`acknowledgement_text`**: dikontrol server, client tidak mengirim/mengubah teks ini. Teks tetap: "Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku."
- **`create_sale(p_test jsonb)`** — RPC security definer, satu transaksi atomik:
  1. Validasi Zod: 12 key `test_results` wajib ada, setiap `hasil` ∈ {Lulus,Ada Catatan,Tidak Diuji}, catatan wajib untuk AC/TU (max 160 char), catatan opsional untuk Lulus.
  2. Evaluasi 7 flag masalah pada `blocking_checks`. Seluruhnya wajib `false`; nilai `true` → raise exception dengan pesan spesifik menyebut item yang gagal.
  3. Insert `sale_unit_tests` dengan `confirmed_at = now()`.
  4. Insert `sales` dengan `id_sale_test` mengacu ke test baru. Trigger `AFTER INSERT ON sales` menangani status unit, margin, warranty seperti biasa.
  5. Seluruh langkah dalam satu transaksi; kegagalan satu langkah membatalkan semua.

## 4. Konvensi Penomoran ID
| Entitas | Format | Contoh |
|---|---|---|
| Unit | `BJ-[BRAND]-[YYMM]-[URUT3]` | BJ-HP-2607-001 |
| Part | `BS-[JENIS]-[URUT3]` | BS-RAM-001 |
| Invoice | `INV-[YYMM]-[URUT3]` | INV-2607-001 |
| Servis | `SVC-[YYMM]-[URUT3]` | SVC-2607-001 |

Urut (`URUT`) reset tiap bulan, dihasilkan lewat sequence/counter table atau query `MAX+1` dengan lock transaksi untuk hindari race condition.

## 5. API / Route Ringkas (Next.js App Router + Supabase)

| Route | Fungsi |
|---|---|
| `POST /api/units` | Buat unit baru + generate QR (JSON body, tanpa foto — lihat Fase 7.6) |
| `GET /api/units/[id]` | Detail unit + riwayat |
| `PATCH /api/units/[id]` | Edit spek & kondisi (admin, hanya `spek_saat_ini`/`kondisi_fisik`/`kondisi_fungsi`). Trigger auto-insert ke `unit_spec_history`. Bila ada field selain ketiga itu, 400 |
| `POST /api/units/[id]/photos` | Generate signed upload URLs (admin, return `{ uploads: [{ signedUrl, path, token }] }`) |
| `PUT /api/units/[id]/photos` | Commit uploaded paths ke `foto_url` (admin, validasi prefix + slot ≤4) |
| `DELETE /api/units/[id]/photos` | Hapus foto dari Storage + `foto_url` (admin) |
| `POST /api/units/[id]/upgrade` | F-UPG-01/F-UPG-03, tambah part, jasa, atau downgrade spek. Downgrade diteruskan ke RPC atomik `add_unit_downgrade()` |
| `DELETE /api/units/[id]/upgrade` | F-UPG-02, lepas log part Bank Stock saja (`id_part IS NOT NULL`); trigger mengembalikan stok +1 dan recalculate `total_modal` |
| `POST /api/sales` | Proses transaksi jual — body termasuk data test F-SLS-02 (12 kategori test_results + buyer acknowledgement); Zod validasi server-side, lalu RPC `create_sale(p_test jsonb)` insert `sale_unit_tests` + `sales` dalam satu transaksi atomik |
| `POST /api/sales/[id]/replacement` | F-WRT-04, Owner-only, proses penggantian unit melalui RPC atomik `replace_warranty_unit()` |
| `POST /api/service` | Buat order servis baru |
| `PATCH /api/service/[id]/status` | Update status servis |
| `POST /api/service/[id]/part` | Tambah part terpakai ke servis |
| `GET /s/[id_servis]` | Halaman publik status servis (read-only) |
| `GET /api/customers?wa=` | Cari customer by nomor WA |
| `GET /katalog` | F-CAT-01, halaman katalog publik (server component, bukan API route terpisah) |
| `GET /katalog/[id_unit]` | F-CAT-02, detail unit publik + OG meta tags |
| `POST /api/catalog/events` | F-CAT-03, validasi dan catat event katalog anonim; flag internal ditentukan dari JWT, bukan request browser |
| `GET /api/reports/export` | F-FIN-04, export CSV dengan parameter `dataset` (`margin`|`turnover`|`leads`|`catalog-summary`|`catalog-top-units`), `start`/`end` atau `days=7|30` (wajib salah satu); Admin/Owner; UTF-8 BOM + formula protection (apostrof `'` di awal sel teks berbahaya); dataset `catalog-*` hanya agregat tanpa raw event |
| `POST /api/units/[id]/delist` | Delist unit (ubah status ke Delisted + reversal finance opsional). Stricter: reject bila ada service order aktif `Diterima/Diagnosa/Dikerjakan` (lihat §3.4) |
| `POST /api/units/[id]/reactivate` | Reactivate unit Delisted kembali ke Ready |
| `GET/POST /api/settings/accounts` | F-SET-01, list & buat akun (owner only) |
| `PATCH /api/settings/accounts/[id]` | F-SET-01, nonaktifkan/reaktivasi akun (owner only) |
| `GET/PATCH /api/settings/app-settings` | F-SET-02, lihat (admin+owner) & ubah (owner only) enam key `app_settings`; API dan form memakai shared contract `lib/app-settings.ts` |
| `GET /api/settings/activity-log` | F-SET-03, baca `admin_actions_log` (owner only) |
| `POST /api/finance/[id]/reversal` | F-FIN-01 poin 3, koreksi transaksi finance (owner only) |
| `POST /api/returns` | F-FIN-06, proses Retur unit/servis (owner only) |
| `POST /api/reservations` | F-RSV-01, buat reservasi (Admin/Owner) — pilih tepat satu: `customerId` existing atau profil customer baru; idempotency key, dp_amount, agreed_price, is_refundable, expires_at |
| `POST /api/reservations/[id]/complete` | F-RSV-02, lunasi + sale (Admin/Owner) — reverse DP + create_sale di agreed_price penuh |
| `POST /api/reservations/[id]/refund` | F-RSV-03, refund DP (Owner only, is_refundable) — cash-out reversal, unit kembali |
| `POST /api/reservations/[id]/forfeit` | F-RSV-04, hanguskan DP (Admin/Owner, non-refundable) — tanpa finance baru, unit kembali |

## 6. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-side only, jangan expose ke client
```

## 7. Definition of Done (berlaku per task di TODO.md)

Sebuah task dianggap selesai jika:
1. Fitur berjalan sesuai alur di FSD.md (nomor F-XXX-XX terkait).
2. Perhitungan uang (modal, margin, biaya) diverifikasi lewat data seed, hasil sesuai manual hitung.
3. Tidak ada field yang bisa diisi manual padahal seharusnya dihitung otomatis (lihat Business Rules BR-01, BR-06 di FSD.md).
4. Migration SQL disimpan di `supabase/migrations/`, bukan diubah langsung di dashboard tanpa file.
5. Commit git terpisah dari task lain, dengan pesan commit yang merujuk kode task (mis. `feat(units): implement F-STK-01 add unit`).

## 3.1 Skema Finance

```sql
create table finance_accounts (
  id_account uuid primary key default gen_random_uuid(),
  nama text not null,
  tipe text not null check (tipe in ('Kas','Bank','E-Wallet')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table finance_transactions (
  id_transaksi uuid primary key default gen_random_uuid(),
  tanggal date not null default current_date,
  arah text not null check (arah in ('Masuk','Keluar')),
  kategori text not null check (kategori in (
    'Pembelian Unit','Pembelian Part','Biaya Upgrade Eksternal',
    'Penjualan Unit','Pendapatan Servis','Operasional',
    'Modal Disetor','Retur Unit','Retur Servis','Selisih Penggantian Unit',
    'Uang Muka Reservasi','Lainnya'
  )),
  id_account uuid not null references finance_accounts(id_account),
  jumlah numeric not null check (jumlah > 0),
  source_module text not null check (source_module in ('Stock','BankStock','Sales','Servis','Manual','Retur','Warranty','Reservasi')),
  source_type text,
  source_id text,
  source_event_key text unique,
  is_reversal boolean not null default false,
  reversal_of uuid references finance_transactions(id_transaksi),
  catatan text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- RETUR (Unit maupun Servis)
create table returns (
  id_retur uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('Sales','Servis')),
  source_id text not null,                 -- id_invoice atau id_servis
  alasan text not null,
  jumlah_refund numeric not null check (jumlah_refund >= 0),
  status text not null default 'Diproses' check (status in ('Diproses','Selesai','Ditolak')),
  tanggal date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now()
);
-- Catatan alur: retur unit membalikkan 3 hal sekaligus dalam satu transaksi DB —
-- (1) units.status kembali ke 'Ready' (bukan 'Terjual'), (2) warranty terkait di-set
-- status 'Habis'/dibatalkan, (3) finance_transactions dapat entri kategori 'Retur Unit'
-- (arah Keluar, karena kas keluar untuk refund) yang mereferensikan id_retur via source_id.
-- Retur TIDAK menghapus row sales asli — sales tetap ada sebagai riwayat, retur adalah
-- event terpisah yang tertaut ke situ.

create table receivables (
  id_receivable uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('Sales','Servis')),
  source_id text not null,
  id_customer uuid references customers(id_customer),
  total_tagihan numeric not null check (total_tagihan > 0),
  total_dibayar numeric not null default 0 check (total_dibayar >= 0),
  jatuh_tempo date,
  status text not null default 'Belum Lunas'
    check (status in ('Belum Lunas','Lunas','Dibatalkan')),
  unique (source_type, source_id)
);

create table finance_payments (
  id_payment uuid primary key default gen_random_uuid(),
  id_receivable uuid not null references receivables(id_receivable),
  id_transaksi uuid not null unique references finance_transactions(id_transaksi),
  jumlah numeric not null check (jumlah > 0),
  tanggal date not null default current_date,
  created_at timestamptz not null default now()
);
```

### Integrasi server-side wajib
1. Pembuatan unit memanggil fungsi finance idempotent untuk mencatat kas keluar `modal_awal`.
2. Restock part wajib melalui event/restock log yang memiliki ID unik; event tersebut mencatat kas keluar nilai restock.
3. Sales Tunai/Transfer membuat penerimaan penuh dalam transaksi database yang sama.
4. Sales Cicilan membuat `receivables`; setiap pembayaran membuat `finance_transactions` dan `finance_payments` secara atomik.
5. Pembayaran servis mengikuti pola yang sama dan tidak dikaitkan hanya pada perubahan status.
6. `source_event_key` wajib unik untuk mencegah transaksi ganda saat request di-retry.
7. Transaksi otomatis immutable. Koreksi memakai reversal, bukan update/delete nominal.
8. Seluruh kalkulasi saldo piutang dan validasi pembayaran dilakukan server-side.
9. **Modal Disetor** dicatat manual oleh Admin lewat form Finance (kategori `Modal Disetor`, `source_module = 'Manual'`) — dipakai saat owner menyuntik dana pribadi ke kas toko, agar saldo kas sistem bisa direkonsiliasi ke saldo kas/rekening fisik.
10. **Retur** (unit maupun servis) — **hanya role `owner`** yang dapat memicu (lihat `FSD.md` F-FIN-06) — wajib berupa satu transaksi database atomik yang: insert row `returns`, insert `finance_transactions` (kategori `Retur Unit`/`Retur Servis`, arah `Keluar`, `source_module = 'Retur'`, `source_id = id_retur`), insert row `admin_actions_log`, dan untuk retur unit — kembalikan `units.status` ke `Ready` serta set `warranty.status` terkait jadi `Habis`. Tidak menghapus row `sales`/`service_orders` asli. Invoice yang memiliki event `warranty_replacements` tidak boleh diretur; guard `BEFORE INSERT OR UPDATE` pada `returns` menolak jalur RPC maupun insert langsung sebelum perubahan state apa pun terjadi.
11. **RLS wajib eksplisit, 3 tingkat**: role `teknisi` **tidak** memiliki akses baca maupun tulis ke `finance_accounts`, `finance_transactions`, `receivables`, `finance_payments`, dan `returns`. Role `admin` dan `owner` boleh SELECT tabel-tabel Finance dan INSERT transaksi baru (Operasional, Modal Disetor, konfirmasi pembayaran) — tapi endpoint reversal/koreksi (poin 7) dan RPC Retur (poin 10) **hanya bisa dipanggil role `owner`**, dicek di level RPC (`raise exception` bila `auth.jwt() ->> 'role' <> 'owner'`), bukan cuma disembunyikan di UI.
12. **Delisting unit** (F-STK-04): admin memanggil RPC `delist_unit(p_id_unit, p_alasan, p_jenis)` dalam satu transaksi atomik. Jenis: `rusak` (tanpa reversal), `retur_supplier` (reversal full: modal_awal + upgrade), `salah_input` (hard delete + reversal full), `hilang` (tanpa reversal). Status unit berubah ke `Delisted` (kecuali `salah_input` yang menghapus row). Reversal finance memakai `is_reversal = true` + `reversal_of` yang mereferensikan transaksi pembelian asli. Reactivate: RPC `reactivate_unit(p_id_unit)` mengembalikan status ke `Ready`; jika sebelumnya ada reversal finance, buat transaksi `Pembelian Unit` baru. **Catatan**: `delist_unit` tetap Admin-accessible karena hanya berlaku untuk unit `Ready`/`Listed` (belum terjual) — begitu unit `Terjual`, satu-satunya jalan "membatalkan"-nya adalah Retur (poin 10), yang Owner-only.
13. **Manajemen akun & `app_settings`** (F-SET-01/02): RPC `create_account`, `deactivate_account`, `update_app_setting` — semua **owner only**, dicek di level RPC. `deactivate_account` menolak eksekusi bila target adalah `owner` terakhir yang aktif (`select count(*) from auth.users where raw_app_meta_data->>'role' = 'owner' and <kondisi aktif>) <= 1`). Semua tiga RPC insert row ke `admin_actions_log` di transaksi yang sama.

### Catatan laporan
- Arus kas membaca `finance_transactions`.
- Laba rugi memakai current state F-WRT-04: sales aktif membaca `sales_current_state.current_transaction_value` dan `current_unit_modal`, sehingga satu rantai penggantian tetap dihitung sebagai satu penjualan dengan unit/nilai/modal terbaru.
- Sales yang sudah selesai diretur tetap menyumbang `sales.harga_jual` asli ke pendapatan kotor, lalu `returns.jumlah_refund` dikurangkan tepat satu kali; sales tersebut tidak menyumbang HPP, konsisten dengan perilaku Retur yang sudah ada.
- Nilai persediaan membaca unit belum terjual dan saldo Bank Stock.
- Pembelian persediaan tidak langsung dianggap beban laba rugi sampai unit/part digunakan atau terjual.
- DP hangus (`reservations.status = 'Hangus'`) menambah pendapatan di P&L sebagai `pendapatan_dp_hangus` — DP sudah dibukukan saat create (cash-in), forfeit tidak membuat entri baru; `get_profit_loss()` membaca langsung dari `reservations.dp_amount` untuk reservasi Hangus dalam periode forfeited_at.

## 3.5 Manajemen Akun, Pengaturan, & Audit Log (Modul 10, Owner only)

```sql
-- AUDIT LOG untuk semua aksi sensitif (Owner only actions + reversal + retur)
create table admin_actions_log (
  id_log uuid primary key default gen_random_uuid(),
  aktor uuid not null references auth.users(id),
  aktor_role text not null,                -- snapshot role saat aksi dilakukan
  aksi text not null check (aksi in (
    'create_account','deactivate_account','reactivate_account',
    'update_app_setting','finance_reversal','process_return',
    'warranty_unit_replacement','create_reservation','complete_reservation',
    'refund_reservation','forfeit_reservation'
  )),
  target_type text,                        -- 'account' | 'app_setting' | 'finance_transaction' | 'return'
  target_id text,
  detail jsonb,                            -- { "before": ..., "after": ... } bila relevan
  catatan text,
  created_at timestamptz not null default now()
);
-- Read-only dari UI. Tidak ada endpoint update/delete untuk tabel ini, termasuk untuk owner.
```

**RLS & RPC (semua owner-only, dicek di level RPC — bukan cuma UI):**

```sql
-- Contoh pola cek role di RPC (ilustratif, bukan literal final)
create or replace function require_owner() returns void as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'owner' then
    raise exception 'Aksi ini khusus role owner';
  end if;
end;
$$ language plpgsql security definer;

-- RPC create_account(p_email, p_role, p_nama) → panggil require_owner(), lalu Supabase Admin API createUser + set app_metadata.role
-- RPC deactivate_account(p_user_id) → panggil require_owner(); tolak bila target owner terakhir aktif; insert admin_actions_log
-- RPC reactivate_account(p_user_id) → panggil require_owner(); insert admin_actions_log
-- RPC update_app_setting(p_key, p_value) → panggil require_owner(); simpan value lama ke detail.before; insert admin_actions_log
-- RPC reverse_transaction(p_id_transaksi, p_catatan) → panggil require_owner(); insert finance_transactions (is_reversal=true, reversal_of=p_id_transaksi); insert admin_actions_log (aksi = 'finance_reversal')
```

## 3.6 Reservasi (DP) — F-RSV-01 s.d. F-RSV-04

Satu DP per unit aktif (partial unique index `reservations_active_unit_idx`). Status `Dipesan` menyisip antara `Listed` dan `Terjual`. Empat RPC atomik menangani lifecycle: create, complete (lunasi + `create_sale`), refund (Owner, cash-out reversal), forfeit (Admin/Owner, cash tetap, P&L `pendapatan_dp_hangus`). Migration additive `202607270001_sales_reservation_integration.sql` menambah payload idempotency canonical dan pembuatan/pemilihan customer atomik tanpa mengubah baseline lifecycle.

```sql
create table public.reservations (
  id_reservation uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_payload jsonb not null,
  id_unit text not null references public.units(id_unit),
  id_customer uuid not null references public.customers(id_customer),
  dp_amount numeric not null check (dp_amount > 0),
  agreed_price numeric not null check (agreed_price > dp_amount),
  is_refundable boolean not null,
  previous_status text not null check (previous_status in ('Ready','Listed')),
  status text not null default 'Dipesan' check (status in ('Dipesan','Selesai','Dibatalkan','Hangus')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  forfeited_at timestamptz,
  id_dp_transaction uuid unique references public.finance_transactions(id_transaksi),
  id_invoice text unique references public.sales(id_invoice),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reservations_active_unit_idx on public.reservations(id_unit)
  where status = 'Dipesan';
```

**Lifecycle:**
```
Ready/Listed ──(create_reservation)──→ Dipesan ──(complete_reservation)──→ Selesai
                                            ├──(refund_reservation, Owner)──→ Dibatalkan
                                            └──(forfeit_reservation)──→ Hangus
```

**Aturan:**
- **Create** (`create_reservation`): Admin/Owner. Overload 11 argumen menerima tepat satu mode customer: `p_id_customer` existing atau data customer baru (`nama`, WA, segmen, sumber); wrapper 7 argumen tetap tersedia untuk kompatibilitas caller lama. Lookup/create customer berada dalam transaksi yang sama dengan reservasi, status unit, Finance, dan audit, sehingga kegagalan tidak meninggalkan customer yatim. WA `0812…`, `812…`, dan `628…` dipetakan ke identitas canonical yang sama tanpa menimpa nama/segmen/sumber profil existing. Validasi dp_amount > 0, < agreed_price, expires_at > now. Finance: Uang Muka Reservasi, arah Masuk.
- **Idempotency canonical**: `request_payload` menyimpan payload normalized yang immutable dan non-null. Advisory lock + perbandingan payload dilakukan sebelum lookup/mutasi customer; replay payload sama mengembalikan reservasi lama, sedangkan key sama dengan payload berbeda ditolak. Backfill migration memakai unit/customer/term canonical agar replay data baseline tetap kompatibel.
- **Complete** (`complete_reservation`): Admin/Owner. Reverse DP (Keluar, Uang Muka Reservasi, is_reversal=true, reversal_of=dp_txn), lalu `create_sale` di `agreed_price` penuh. Hanya Tunai/Transfer (v1). Penuh F-SLS-02 test. Overdue ditolak. Net cash = agreed_price penuh.
- **Refund** (`refund_reservation`): **Owner only**. Hanya untuk `is_refundable = true`. Cash-out reversal DP. Unit kembali ke `previous_status`.
- **Forfeit** (`forfeit_reservation`): Admin/Owner. Hanya untuk `is_refundable = false`. Tidak ada entri finance baru (DP sudah dibukukan saat create; diakui di P&L sebagai `pendapatan_dp_hangus`). Unit kembali ke `previous_status`.
- **Overdue (expired)**: `complete_reservation` ditolak. `refund`/`forfeit` tetap tersedia. Tidak ada auto-resolution — reservasi tetap `Dipesan` dan unit tetap terkunci sampai manual resolution.
- **RLS**: SELECT untuk authenticated; semua INSERT/UPDATE via security definer RPC.

**Surface Sales terpadu:**
- `/sales` memiliki tab Penjualan dan Reservasi; `/reservations` hanya compatibility redirect ke `/sales?view=reservations`.
- `/sales/new`: langkah pertama memilih unit `Ready`/`Listed`, customer existing/baru, dan jenis transaksi. Penjualan langsung lanjut ke F-SLS-02 sebelum konfirmasi. Reservasi langsung mengirim detail DP/expiry tanpa F-SLS-02.
- `/sales/new?reservation=<id>` menyelesaikan reservasi aktif: tampilkan ringkasan DP/sisa, jalankan F-SLS-02, lalu panggil completion. Aksi refund/forfeit hanya tersedia untuk reservasi `Dipesan` sesuai role dan refundable flag.

**Catatan implementasi:**
- `require_owner()` dipanggil di **setiap** RPC sensitif sebagai baris pertama — pola konsisten, bukan re-implementasi cek role di tiap function secara ad-hoc.
- RLS di `admin_actions_log`: `SELECT` hanya untuk `owner`; tidak ada `INSERT`/`UPDATE`/`DELETE` policy untuk role manapun dari client — semua insert terjadi lewat `security definer` function di atas.
- Halaman UI Manajemen Akun, Pengaturan Aplikasi, dan Log Aktivitas berada di route baru `app/(dashboard)/settings/` — item menu ini **hanya dirender untuk role `owner`** di komponen nav (`SPEC.md` §2.1), sama seperti pola filter menu per role yang sudah berjalan.
