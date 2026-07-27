# FSD — Functional Specification Document
## BJ Stock
v1.0 · Juli 2026

---

## 1. Aktor Sistem

| Aktor | Akses |
|---|---|
| Owner | Superset dari Admin, ditambah: manajemen akun (buat/nonaktifkan Admin & Teknisi), edit `app_settings`, dan dua aksi terbatas yang **tidak bisa** dilakukan Admin — koreksi/reversal transaksi Finance, dan proses Retur atas unit `Terjual` (lihat §2.7 "Aturan akses" dan §2.9 Modul 10) |
| Admin | Full CRUD modul operasional (Stock, Bank Stock, Sales, Servis, CRM, Finance input harian), lihat laporan — **tidak bisa** koreksi/hapus transaksi Finance yang sudah tercatat, **tidak bisa** memproses Retur atas unit `Terjual`, **tidak bisa** mengelola akun atau `app_settings` |
| Teknisi | CRUD Servis & Upgrade Log, read-only modul lain — **tidak ada akses (baca maupun tulis) ke modul Finance** (`finance_accounts`, `finance_transactions`, `receivables`, `finance_payments`, `returns`), ditegakkan lewat RLS policy eksplisit, bukan asumsi |
| Customer (publik) | Read-only halaman status servis via link/QR, tanpa login |

## 2. Alur Fungsional per Modul

### 2.1 Stock Masuk

**F-STK-01 — Tambah Unit Baru**
1. Admin input: brand, model, serial number, spek awal, kondisi fisik (Grade A/B/C), kondisi fungsi, sumber beli, modal awal, tanggal masuk. (Foto ditambahkan terpisah setelah unit dibuat — lihat F-STK-05.)
2. Sistem generate `id_unit` otomatis: `BJ-[BRAND]-[YYMM]-[URUT]` (urut reset tiap bulan per brand atau global — ditentukan saat implementasi, default: global per bulan).
3. Sistem generate QR code berisi `id_unit`, siap dicetak.
4. Status default: `Masuk`.
5. Setelah unit disimpan, admin redirect ke halaman detail unit; dari sana admin bisa tambah foto via `PhotoUploadForm` (lihat F-STK-05 untuk alur upload & galeri).

**Validasi:**
- Serial number tidak boleh duplikat aktif (unit yang sama tidak terdaftar dua kali dalam status non-Selesai).
- Modal awal wajib > 0.

**F-STK-02 — Update Status Unit**
Transisi status yang diizinkan (linear, tidak boleh mundur kecuali oleh Admin dengan alasan/catatan):
```
Masuk → QC → Ready → Listed → Terjual → Selesai
              │       │
              └──┬────┘
                 ↓ create reservation
              Dipesan ──→ Terjual (completion, F-RSV-02)
                 └──────→ previous_status: Ready/Listed (refund/forfeit, F-RSV-03/04)
Ready/Listed → Delisted (F-STK-04)
Delisted → Ready (reactivate, F-STK-04)
Terjual → Ready (Cancel Sales / Retur)
Terjual → QC (Warranty Replacement, F-WRT-04)
```
- `Dibatalkan` dan `Hangus` adalah status pada tabel `reservations`, bukan status unit. Setelah refund/forfeit, status unit kembali ke `previous_status` (`Ready`/`Listed`).
- `Terjual` hanya bisa dicapai melalui proses Sales (F-SLS-01) atau completion reservasi (F-RSV-02), tidak diubah manual.
- `Selesai` ditandai setelah masa garansi berakhir tanpa klaim aktif.
- Transisi ke `Listed` **wajib** mengisi `harga_listing` (angka yang dipasang di konten/marketplace) — sistem menolak transisi ke `Listed` kalau field ini kosong. `harga_listing` bisa diedit ulang selama unit masih berstatus `Listed` (mis. repricing), tapi begitu status pindah ke `Terjual`, nilainya jadi riwayat statis (tidak berubah lagi).

**F-STK-04 — Delisting Unit**
Unit yang sudah masuk inventaris tidak pernah dihapus dari sistem (menjaga integritas jurnal finance, riwayat upgrade, dan QR code yang sudah dicetak). Sebagai gantinya, admin dapat menandai unit sebagai `Delisted` — dikeluarkan dari stok aktif tanpa menghilangkan jejak audit.

**Kapan bisa delist:**
- Hanya dari status `Ready` atau `Listed`. Unit `Terjual`/`Selesai` tidak dapat delist (gunakan Retur untuk membatalkan penjualan).
- **Stricter (sejak Fase 7.8)**: bila ada service order aktif (`Diterima`/`Diagnosa`/`Dikerjakan`) untuk unit ini, delist **ditolak**.unit harus selesaikan/batalkan service order terlebih dahulu (lihat `SPEC.md` §3.4).Trigger dijawab `RPC delist_unit` memeriksa count service order aktif dan raise exception bila > 0.

**Tombol delist (UI):**
- Tombol "Delist unit" adalah primary outline-red button di action row halaman detail (bukan inline `<details>` yang collapsible). Dipanggil dari `/units/[id]` action buttons row.
- Klik tombol → buka native `<dialog>` modal dengan pilih jenis delist (4 skenario) + alasan textarea.
- Skenario `salah_input` (hard delete) tetap minta konfirmasi ganda (checkbox + teks "Saya mengerti unit akan dihapus permanen").
- Error API (mis. "Unit tidak dapat delist karena masih ada service order aktif") ditampilkan inline di modal, tidak dihilangkan — user bisa tutup modal setelah lihat error.

**Alasan delist (pilih salah satu):**
1. **Rusak parah / tidak bisa diperbaiki** — unit rusak fisik/fungsi dan tidak ekonomis diperbaiki. Tidak ada reversal finance (modal jadi kerugian).
2. **Retur supplier (refund)** — unit dikembalikan ke supplier, uang beli kembali. Reversal finance otomatis sebesar `modal_awal + SUM(upgrade_log.biaya)` (kas masuk kembali).
3. **Salah input** — unit tidak pernah ada secara fisik (typo ID, double input, salah nominal). Hard delete + reversal finance penuh. Kasus jarang, butuh konfirmasi ganda.
4. **Hilang / dicuri** — unit tidak ditemukan. Tidak ada reversal finance (modal jadi kerugian).

**Dampak delist:**
- Status unit berubah ke `Delisted`; unit hilang dari daftar stok aktif dan tidak bisa dijual.
- QR code masih bisa di-scan — halaman detail menampilkan "Unit Delisted" dengan alasan dan tanggal.
- Reversal finance (hanya untuk skenario retur supplier & salah input): transaksi `Pembelian Unit` asli di-reverse (kas masuk kembali), dan reversal `Biaya Upgrade Eksternal` untuk setiap upgrade log yang ada.
- Upgrade log tetap ada sebagai riwayat. Jika ada part yang masih layak pakai dan ingin dikembalikan ke Bank Stock, admin hapus upgrade log-nya terpisah sebelum delist (stok part bertambah otomatis).

**Reactivate (opsional, kasus jarang):**
- Unit `Delisted` dapat dikembalikan ke `Ready` oleh admin (mis. unit ditemukan kembali, atau unit diperbaiki setelah sempat dianggap rusak).
- Reactivate tidak membuat transaksi finance baru — hanya mengubah status kembali ke `Ready`.
- Jika sebelumnya ada reversal finance (retur supplier), reactivate membuat transaksi `Pembelian Unit` baru (kas keluar kembali) agar saldo finance konsisten.

**F-STK-05 — Galeri Foto Unit & Lightbox**
Setelah unit dibuat (F-STK-01), admin dapat menambah/menghapus foto unit dari halaman detail unit. Foto tidak wajib saat create; unit bisa dibuat dulu tanpa foto, lalu foto ditambahkan kapan saja selama unit belum berstatus `Terjual` (clamping status: upload di-disable bila unit `Delisted`).

**Constraint foto:**
- Maksimal 4 foto per unit.
- Maksimal 5 MB per file; tipe: JPG, PNG, WebP.
- Upload lewat signed URL flow (lihat `SPEC.md` §3.2): client minta signed URL ke API → PUT langsung ke Supabase Storage → PUT commit path ke API.
- Path di Storage: `${id_unit}/${uuid}.<ext>`.

**Tampilan galeri (`/units/[id]`):**
- Grid 2-kolom mobile, 3-kolom desktop. Aspect ratio thumb 4:3, `object-cover`.
- Admin: tombol hapus per thumb — selalu visible di mobile (HP-friendly, no hover-only), `group-hover` di desktop.
- Teknisi/user non-admin: gallery read-only tanpa tombol hapus. Lightbox tetap bisa dibuka.
- Klik thumb → lightbox (native `<dialog>` full-viewport, full-size image `object-contain` tidak di-crop, indikator posisi "1/4", navigasi prev/next button + keyboard ←/→, tutup via Esc / klik backdrop / tombol ✕).

**Alur hapus foto (admin):**
1. Klik tombol hapus di thumb → konfirmasi `confirm("Hapus foto ini?")`.
2. Client `DELETE /api/units/[id]/photos` dengan body `{ url }` → server hapus file Storage + update `units.foto_url` (set ke `null` jika array kosong).
3. `router.refresh()`.

**F-STK-06 — Edit Spek & Kondisi + Riwayat Perubahan**
Setelah unit dibuat (F-STK-01), admin bisa mengupdate spesifikasi yang berubah seiring waktu (mis. RAM di-upgrade fisik tetapi spek tertulis belum diperbarui, kondisi fisik turun karena pakai, kondisi fungsi berubah). Audit trail perubahan disimpan di `unit_spec_history`.

**Field yang bisa di-edit:**
- `spek_saat_ini` (textarea) — teks bebas, snapshot spek saat ini.
- `kondisi_fisik` (select: A/B/C) — grade kondisi fisik unit.
- `kondisi_fungsi` (input teks) — catatan kondisi fungsi.
- Field `serial_number`, `sumber_beli`, `modal_awal`, `tanggal_masuk`, `spek_awal` **tidak bisa diubah** setelah create (typo serial / koreksi modal tetap lewat delist `salah_input` + re-create bila perlu).
- Field **`brand` dan `model` boleh dikoreksi** oleh Admin/Owner lewat modal Edit unit (`PATCH /api/units/[id]`) untuk typo penamaan. **`id_unit` tidak di-regenerate** (kode QR/ID tetap). Perubahan brand/model dicatat audit `edit_unit_identity` bila tersedia.

**Alur edit (admin):**
1. Di `/units/[id]`, section "Spek & Kondisi" menampilkan current spec ringkas (spek_saat_ini + kondisi fisik/fungsi) + snapshot `spek_awal` (read-only) untuk perbandingan cepat.
2. Tombol "Edit unit" (outline amber) → buka native `<dialog>` modal dengan field: brand, model, spek_saat_ini, kondisi_fisik, kondisi_fungsi (pre-filled). Modal mengunci scroll background (`.dashboard-content`); hanya panel form yang scroll.
3. Save → `PATCH /api/units/[id]` dengan body `{ spek_saat_ini?, kondisi_fisik?, kondisi_fungsi? }` — hanya field yang berubah dikirim. Bila tak ada field yang distinct dari current, no-op insert trigger tidak mengeksekusi, save tetap sukses (http 200, no row inserted).
4. Trigger `AFTER UPDATE OF spek_saat_ini, kondisi_fisik, kondisi_fungsi` auto-insert row baru ke `unit_spec_history` dengan `changed_at = now()` + `changed_by = auth.uid()` + `catatan = null` (kosong, atau bisa diisi dari frontend bila user mengisi catatan alasan).
5. `router.refresh()` → halaman re-render dengan current spec baru + timeline baru muncul.

**Tampilan riwayat (timeline):**
- Section "Riwayat perubahan spesifikasi" (expandable via `<details>`) di `/units/[id]`, fetch `unit_spec_history where id_unit = $1 order by changed_at desc`.
- Timeline vertikal (`<ol>`) dengan badge marker per entry: badge "Terbaru" (paling atas) + badge "Spek awal" (entry paling bawah / catatan "Spek awal saat unit dibuat" dari trigger INSERT).
- Setiap entry tampilkan: `changed_at` (format Indonesia), `changed_by` (email user bila join ke `auth.users`), `catatan`, dan diff ketiga field (spek_saat_ini/kondisi_fisik/kondisi_fungsi). Bila semua null → tampilkan placeholder "-".

**Permission:**
- Edit modal: Admin **dan** Owner. Tombol "Edit unit" hanya muncul bila `isAdmin` (role admin/owner di layout dashboard).
- Read timeline: semua user login.

**F-STK-03 — Lookup via Scan QR**
1. Admin scan QR di HP → sistem cari `id_unit` → tampilkan halaman detail (spek, kondisi, riwayat upgrade, status, riwayat servis/garansi jika sudah terjual).
2. Jika `id_unit` tidak ditemukan → tampilkan pesan error, opsi cari manual by keyword.

### 2.2 Bank Stock & Upgrade Log

**F-BNK-01 — Tambah/Update Part**
- Admin input jenis part, kondisi, qty, modal per unit, sumber.
- Qty bertambah saat restock, berkurang otomatis saat dipakai (F-UPG-01 / F-SVC-03).

**F-UPG-01 — Pasang Part ke Unit**
1. Dari halaman detail unit, admin pilih "Tambah Upgrade".
2. Pilih part dari Bank Stock (qty tersedia) atau input biaya servis tanpa part (jasa saja).
3. Sistem: kurangi qty Bank Stock sejumlah 1 (atau sesuai input), tambahkan `biaya` ke `total_modal` unit, catat log dengan tanggal & catatan.

**Validasi:**
- Tidak bisa pilih part dengan qty = 0.
- `total_modal` unit di-recalculate otomatis: `modal_awal + SUM(part/jasa) − SUM(downgrade)`.

**F-UPG-02 — Lepas Part dari Unit**
1. Dari Upgrade Log pada halaman detail unit, Admin/Teknisi memilih **Lepas part** pada log yang berasal dari Bank Stock.
2. Setelah konfirmasi, sistem menghapus log part, mengembalikan qty Bank Stock sebanyak 1, lalu menghitung ulang `total_modal` secara atomik.
3. Log jasa tanpa part tidak dapat dihapus lewat aksi ini karena koreksinya menyentuh Finance.
4. Jika part pengganti akan dipasang, catat sebagai upgrade part baru setelah part lama dilepas agar kedua mutasi stok tetap terlacak.

**F-UPG-03 — Downgrade Spek Manual**
1. Dari form **Tambah upgrade / downgrade**, Admin/Owner/Teknisi memilih **Downgrade spek (kurangi modal)**.
2. User mengisi nominal pengurangan modal (> 0), spek lengkap setelah downgrade, tanggal, dan catatan. Contoh: RAM 8 GB diturunkan menjadi 4 GB.
3. RPC atomik mengunci unit, menyimpan Upgrade Log `jenis = downgrade`, mengurangi `total_modal`, dan memperbarui `units.spek_saat_ini`. Trigger spek existing otomatis menambah `unit_spec_history`.
4. Downgrade hanya berlaku untuk unit stok aktif (`Masuk`/`QC`/`Ready`/`Listed`) dan ditolak jika hasil `total_modal <= 0`.
5. Event downgrade tidak mengubah Bank Stock dan tidak membuat jurnal Finance. Part copotan dapat dicatat manual melalui modul Bank Stock sebagai proses terpisah.
6. Baris downgrade immutable dari akses tabel client; pembuatan wajib melalui `add_unit_downgrade()` agar log, spek, dan modal tidak dapat berubah separuh.

### 2.3 Sales

**F-SLS-01 — Transaksi Penjualan**
1. Admin scan QR unit → sistem cek status harus `Ready` atau `Listed` (unit dengan status lain ditolak, tampilkan alasan).
2. UI dibagi menjadi dua langkah dalam satu form: **Detail transaksi** lalu **Pengujian unit**. Pergantian langkah tidak membuat draft atau request terpisah; satu-satunya submit tetap konfirmasi final pada langkah kedua.
3. Langkah Detail menampilkan ID/model unit, lalu Admin input/pilih customer (cari existing by nomor WA, atau buat baru), sumber lead (`TikTok`/`Reels`/`Instagram`/`Facebook Marketplace`/`WA`/`Referral`/`Lainnya`), harga jual, channel (Offline/Marketplace/IG/TikTok/WA), metode bayar, dan durasi garansi (prefill dari `app_settings.default_warranty_unit_days`, dapat diubah admin). Field harga jual **di-prefill dari `units.harga_listing`** (kalau ada), tapi admin tetap bebas mengubahnya sesuai hasil nego akhir — `harga_listing` dan `harga_jual` adalah dua nilai terpisah, margin selalu dihitung dari `harga_jual` bukan `harga_listing`.
4. Tombol **Selanjutnya** memvalidasi field wajib di langkah Detail, lalu menampilkan F-SLS-02. Konfirmasi final → sistem:
   - Set status unit → `Terjual`.
   - Hitung `margin = harga_jual − total_modal`.
   - Generate `id_invoice` otomatis.
   - Generate record Garansi (F-WRT-01).
   - Link transaksi ke profil customer di CRM.

**Validasi:**
- Harga jual wajib diisi, > 0.
- Tidak bisa transaksi ulang pada unit yang sudah berstatus `Terjual`.

**F-SLS-02 — Pre-Payment Unit Testing**
1. Alur test adalah langkah kedua form transaksi jual (F-SLS-01) — **tidak ada alur draft terpisah atau endpoint terpisah**. Admin mengisi 12 kategori test, buyer memberi acknowledgement, lalu satu action final (`POST /api/sales`) memvalidasi dan menyimpan test + sale secara atomik dalam satu transaksi database via RPC `create_sale(p_test jsonb)`. 12 kategori test:
   a. **Identitas/Spek/Serial** — verifikasi brand, model, serial number sesuai data sistem.
   b. **Fisik/Casing/Engsel** — kondisi fisik casing, engsel, retak/lecet.
   c. **Layar/Dead Pixel** — pixel mati, burn-in, backlight bleed.
   d. **Keyboard/Touchpad** — tombol berfungsi, touchpad responsif.
   e. **Wi-Fi/Bluetooth** — konektivitas nirkabel.
   f. **Webcam/Mic/Speaker/Audio** — kamera, mikrofon, speaker, jack audio 3.5mm.
   g. **USB/USB-C** — seluruh port USB dan USB-C.
   h. **HDMI/Display Output** — port HDMI dan display output lainnya.
   i. **Baterai/Charger/Keamanan Charger** — kondisi baterai, health, charger original/aman.
   j. **Storage Health** — SSD/HDD health (SMART), kapasitas sesuai spek.
   k. **Boot/OS/BIOS/MDM** — boot test, OS berfungsi, BIOS tidak terkunci, MDM lock.
   l. **Aksesoris Termasuk** — charger, dus, dokumen, kabel, adaptor.

2. **Outcome per kategori** (pilih salah satu):
   - **Lulus** — berfungsi normal sesuai standar. Catatan opsional (maks 160 karakter).
   - **Ada Catatan** — berfungsi dengan catatan. Wajib isi catatan (maks 160 karakter).
   - **Tidak Diuji** — kategori tidak dites. Wajib isi alasan (maks 160 karakter).

   Batas 160 karakter berlaku untuk penyimpanan maupun cetakan — tidak ada pemotongan `...`.

3. **Hard blocker** — item berikut WAJIB Lulus agar test dapat dilanjutkan ke konfirmasi jual:
   - Identitas mismatch (brand/model tidak sesuai data).
   - Serial mismatch (nomor serial tidak sesuai).
   - Spek mismatch (spesifikasi tidak sesuai data sistem).
   - Baterai swollen (menggelembung / berbahaya).
   - BIOS lock (terkunci password BIOS).
   - MDM lock (perangkat terikat MDM/management device).
   - Charger tidak aman (risiko kebakaran/korsleting: kabel putus/isolasi terbuka, adaptor non-standar tanpa sertifikasi SNI/UL).

4. **Buyer acknowledgement** — checkbox eksplisit yang **belum dicentang** secara default (tidak pre-checked). Teks persetujuan **dikontrol server** (`sale_unit_tests.acknowledgement_text`), client tidak mengirim/mengubah teks ini:
   "Pembeli telah menyaksikan atau menerima ringkasan hasil pengujian di atas sebelum pembayaran dan memahami setiap catatan atau bagian yang tidak diuji. Persetujuan ini tidak menghapus, mengurangi, atau membatasi garansi BJ Laptop maupun hak konsumen berdasarkan hukum yang berlaku."

5. **Test dan sale bersifat atomik — satu action final:**
   - Semua data test (12 kategori + buyer acknowledgement) dikirim bersamaan dalam satu request `POST /api/sales`.
   - Server memvalidasi setiap kategori, mengevaluasi 7 blocking checks dari hard blocker, menyimpan `sale_unit_tests` dengan `confirmed_at = now()`, lalu membuat `sales` — dalam satu transaksi database via RPC `create_sale(p_test jsonb)`.
   - Setelah transaksi dikonfirmasi, hasil test **tidak dapat diubah (immutable)** — trigger `BEFORE UPDATE OR DELETE ON sale_unit_tests` menolak perubahan pada row yang sudah `confirmed_at IS NOT NULL`.
   - **Tidak ada status unit baru** — unit tetap di `Ready`/`Listed` sampai transaksi final.

6. **Cetakan kontrak (print receipt):**
   - Format: **satu lembar A4**, mengikuti pilihan orientasi browser; CSS tidak boleh memaksa Landscape sehingga pilihan Portrait/Landscape di print dialog benar-benar mengubah preview.
   - **Landscape**: invoice existing di kiri memakai lebar 174 mm dan panel test 103 mm, mempertahankan ukuran invoice sebelumnya.
   - **Portrait**: invoice dan panel test tetap berdampingan dalam komposisi 114 mm + 76 mm; tinggi panel test diperluas mengikuti tinggi halaman dan tipografi ringkas disesuaikan agar tetap satu lembar.
   - **Kanan**: ringkasan hasil test compact — 12 baris tetap (fixed rows), 3 kolom per baris: kategori (nama singkat), hasil (L/AC/TU), catatan (maks 160 karakter, ditampilkan penuh).
   - Tidak ada pemotongan catatan (`...`) — input sudah dibatasi 160 karakter di form.
   - Tidak ada halaman kedua — panel kanan menyesuaikan font/spasi agar 12 baris muat di ruang tersisa setelah invoice di kiri.

**Validasi F-SLS-02:**
- Setiap kategori wajib memiliki outcome (`Lulus`/`Ada Catatan`/`Tidak Diuji`).
- Outcome `Ada Catatan` atau `Tidak Diuji` wajib memiliki catatan (min 1 karakter, maks 160 karakter).
- Hard blocker (poin 3) wajib `Lulus` — RPC `create_sale` menolak dengan pesan spesifik menyebut item yang gagal.
- Buyer acknowledgement wajib dikirim sebagai boolean `true`; RPC menolak nilai lain, menyimpan teks persetujuan server-side, dan memberi `confirmed_at = now()` pada snapshot final.
- Tidak ada mekanisme draft — test hanya dapat dikirim bersamaan dengan sale dalam satu action final.
- Test yang sudah terikat ke transaksi final tidak bisa diedit (immutable trigger).

### 2.4 Aftersales (Garansi)

**F-WRT-01 — Generate Garansi Otomatis**
- Trigger: setelah F-SLS-01 sukses.
- `tanggal_mulai = tanggal_transaksi`, `tanggal_berakhir = tanggal_mulai + sales.durasi_garansi_hari`.
- `durasi_garansi_hari` di-prefill dari `app_settings.default_warranty_unit_days` (default 30) saat form transaksi dibuat, tapi admin dapat mengubahnya per transaksi (mis. unit Grade C dikasih garansi lebih pendek) sebelum konfirmasi jual. Nilai ini **tidak boleh** ditulis sebagai literal angka di trigger — trigger hanya membaca kolom `sales.durasi_garansi_hari`.
- Status garansi: `Aktif`.

**F-WRT-02 — Klaim Garansi**
1. Admin scan QR unit yang dibawa customer → sistem tampilkan status garansi (Aktif/Habis) dan sisa hari.
2. Jika Aktif → admin buat Klaim Servis: keluhan, tindakan, part terpakai (opsional), biaya (0 jika full covered garansi).
3. Status garansi tidak berubah karena klaim (garansi tetap berjalan sampai `tanggal_berakhir`, kecuali kebijakan lain ditentukan kemudian).

**F-WRT-03 — Auto-expire**
- Job berkala (atau dihitung on-the-fly saat lookup) menandai garansi `Habis` jika `today > tanggal_berakhir`.

**F-WRT-04 — Penggantian Unit Dalam Garansi (Owner only)**
1. Penggantian hanya dapat diproses dari klaim pada garansi aktif. Admin/teknisi dapat mencatat klaim dan diagnosis; hanya Owner yang dapat mengonfirmasi penggantian karena aksi menyentuh Sales, stok final, garansi, dan Finance.
2. Owner memilih unit pengganti berstatus `Ready` atau `Listed`, mengisi nilai unit pengganti yang disepakati, tanggal, alasan, dan akun Finance bila ada selisih. Unit pengganti harus berbeda dari unit yang sedang dipegang customer.
3. Penggantian bukan Cancel Sales, Retur, atau Sales baru. Row `sales` asli (`id_invoice`, `id_unit`, `harga_jual`, `margin`) tetap sebagai snapshot audit; hubungan unit lama/baru disimpan sebagai event immutable `warranty_replacements` dan dapat membentuk rantai jika unit pengganti kembali rusak.
4. Sistem menghitung server-side `price_difference = replacement_transaction_value - previous_transaction_value`: harga sama tidak membuat transaksi Finance; nilai lebih tinggi membuat top-up masuk; nilai lebih rendah membuat refund keluar. Piutang cicilan lama tidak berubah dan selisih diselesaikan langsung melalui akun Finance yang dipilih.
5. Dalam satu transaksi database atomik: unit lama `Terjual → QC`, unit pengganti `Ready/Listed → Terjual`, garansi lama menjadi `Habis`, garansi baru dibuat, service order yang terhubung klaim ditutup `Diambil` dengan tindakan penggantian, event Finance selisih dibuat bila perlu, lalu audit log ditulis. Kegagalan salah satu langkah membatalkan semua langkah.
6. Garansi baru berakhir pada `max(tanggal_berakhir_lama, tanggal_penggantian + replacement_grace_days)`. Setting `replacement_grace_days` default 7 dan nilainya di-snapshot pada event penggantian.
7. Read model Sales/CRM/invoice menampilkan unit terakhir yang diterima customer, nilai transaksi terakhir, jumlah penggantian, dan garansi aktif. Invoice asli tidak diubah; sistem menyediakan bukti penggantian terpisah yang dapat dicetak.
   Pilihan Portrait/Landscape pada print dialog untuk invoice maupun bukti penggantian harus dihormati; tidak ada `@page size` global yang memaksa satu orientasi.
8. Laporan tidak menambah jumlah penjualan atau revenue penuh kedua. Nilai transaksi tersesuaikan adalah nilai penggantian terakhir; margin tersesuaikan adalah nilai tersebut dikurangi snapshot `total_modal` unit yang saat ini diterima customer.

**Validasi F-WRT-04:**
- Tolak bila invoice sudah Cancel/Retur, klaim sudah dipakai, garansi habis, unit aktif bukan `Terjual`, unit pengganti bukan `Ready`/`Listed`, atau akun Finance tidak aktif.
- Selisih non-zero wajib memiliki akun Finance; selisih zero wajib tidak membuat transaksi Finance.
- Request memakai idempotency key; retry payload sama mengembalikan event yang sama, reuse key dengan payload berbeda ditolak.

### 2.5 Servis Umum (Modul 6)

**F-SVC-01 — Terima Order Servis**
1. Admin/teknisi pilih jenis servis: Repair / Install / Cleaning.
2. Dua sub-alur:
   - **a) Servis unit sendiri** — scan QR unit yang sudah ada `id_unit` → sistem auto-isi brand/model & link ke garansi jika ada.
   - **b) Servis umum (customer luar)** — input manual brand/model laptop customer (tidak ada `id_unit`).
3. Input/pilih customer (CRM), keluhan awal.
4. Sistem generate `id_servis` format `SVC-[YYMM]-[URUT]` + QR tanda terima (cetak/kirim link ke customer).
5. Status: `Diterima`.

**F-SVC-02 — Diagnosa & Pengerjaan**
1. Teknisi update status → `Diagnosa`, isi hasil diagnosa.
2. Update status → `Dikerjakan`, isi tindakan yang dilakukan.
3. Jika butuh part: pilih dari Bank Stock (F-SVC-03).

**F-SVC-03 — Pemakaian Part dalam Servis**
- Sama seperti F-UPG-01, tapi ditautkan ke `id_servis` bukan `id_unit`.
- Sistem kurangi qty Bank Stock, tambahkan ke `biaya_part` order servis.

**F-SVC-04 — Penyelesaian & Serah Terima**
1. Teknisi set status → `Selesai`, sistem hitung `total_biaya = biaya_jasa + biaya_part`.
2. Saat customer datang ambil: admin scan QR tanda terima → set status → `Diambil`, generate nota.
3. Sistem set `garansi_servis` (durasi konfigurasi, default 7 hari) mulai dari tanggal `Diambil`.

**F-SVC-05 — Cek Status oleh Customer (Publik)**
- Customer buka link/scan QR tanda terima → halaman read-only menampilkan status terkini order servis (tanpa detail biaya internal/modal, hanya status & estimasi selesai).

**Transisi status servis (linear):**
```
Diterima → Diagnosa → Dikerjakan → Selesai → Diambil
```

### 2.6 CRM

**F-CRM-01 — Profil Customer**
- Dibuat otomatis saat transaksi pertama (Sales atau Servis) jika belum ada (dicek by nomor WA).
- Menyimpan: nama, WA, segmen, sumber lead.
- Riwayat gabungan ditampilkan dalam satu timeline: pembelian unit + order servis, terurut tanggal.

**F-CRM-02 — Reminder (fase lanjut)**
- Trigger reminder H-7 sebelum garansi unit habis (opsional, dikirim manual oleh admin dari daftar yang di-generate sistem — bukan auto-WA blast di fase awal).

## 3. Aturan Bisnis Kunci (Business Rules)

| Kode | Aturan |
|---|---|
| BR-01 | `total_modal` unit selalu dihitung ulang otomatis, tidak pernah diedit manual langsung |
| BR-02 | Bank Stock adalah sumber part tunggal untuk Upgrade Unit maupun Servis — tidak ada stok part terpisah per modul |
| BR-03 | Status unit `Terjual` hanya bisa terjadi lewat alur Sales, tidak ada tombol ubah status manual ke Terjual |
| BR-04 | Setiap order servis (baik unit sendiri maupun customer luar) wajib punya `id_servis` unik dan QR sendiri |
| BR-05 | Customer publik tidak pernah melihat data modal/biaya internal, hanya status & ringkasan biaya jasa yang harus dibayar |
| BR-06 | Semua perhitungan uang (margin, total modal, total biaya servis) dilakukan server-side, bukan dihitung di frontend saja |
| BR-07 | Unit tidak pernah dihapus dari database (kecuali skenario salah input dengan konfirmasi ganda); delisting mengubah status ke `Delisted` dan menjaga integritas finance + audit trail |
| BR-08 | Reversal finance pada delisting hanya terjadi jika uang benar-benar kembali (retur supplier / salah input); unit rusak/hilang tidak mendapat reversal |

## 4. Skema Layar (Ringkas)

| Layar | Aktor | Fungsi Utama |
|---|---|---|
| Dashboard | Admin | Ringkasan stock, servis aktif, garansi akan habis |
| Daftar Unit / Detail Unit | Admin | CRUD unit, riwayat upgrade, tombol scan |
| Scan QR (kamera) | Admin, Teknisi | Lookup cepat unit/servis |
| Form Transaksi Jual | Admin | Alur Sales (F-SLS-01) |
| Form Pre-Payment Test | Admin | 12 kategori test sebelum konfirmasi jual (F-SLS-02) |
| Daftar Bank Stock | Admin | CRUD part |
| Daftar Servis / Detail Servis | Admin, Teknisi | Alur F-SVC-01 s.d. F-SVC-04 |
| Halaman Status Servis (publik) | Customer | F-SVC-05, read-only |
| Profil Customer | Admin | F-CRM-01, riwayat gabungan |
| Laporan (fase akhir) | Admin | Margin, perputaran stock, sumber lead |
| Manajemen Akun | Owner | F-SET-01, buat/nonaktifkan Admin & Teknisi |
| Pengaturan Aplikasi | Owner (edit), Admin (read-only) | F-SET-02, `app_settings` |
| Log Aktivitas | Owner | F-SET-03, audit trail aksi sensitif |
| Koreksi/Reversal Finance | Owner | F-FIN-01 poin 3, tombol tidak tersedia untuk Admin |
| Proses Retur | Owner | F-FIN-06, tombol tidak tersedia untuk Admin |
| Katalog Publik | Publik (tanpa login) | F-CAT-01, grid unit Listed |
| Detail Katalog Unit | Publik (tanpa login) | F-CAT-02, detail + tombol WA + OG tags |

## 2.7 Finance (Modul 9)

**F-FIN-01 — Jurnal Kas Otomatis**
1. Setiap peristiwa uang dari modul Stock, Bank Stock, Sales, dan Servis membuat transaksi finance secara server-side.
2. Transaksi otomatis wajib menyimpan `source_module`, `source_type`, `source_id`, dan `source_event_key` unik agar retry tidak menghasilkan duplikasi.
3. Transaksi otomatis tidak dapat diedit nominalnya dari UI Finance; koreksi dilakukan dengan transaksi pembalik dan catatan alasan. **Transaksi pembalik (reversal) hanya dapat dipicu role `owner`** — Admin dapat *melihat* seluruh riwayat transaksi Finance tapi tidak punya akses ke aksi "Koreksi/Reversal" di UI maupun endpoint-nya (lihat §2.9 F-SET-03).

**F-FIN-02 — Biaya Operasional Manual**
- Admin dapat mencatat pengeluaran yang tidak berasal dari modul lain: sewa, listrik, internet, gaji, transportasi, marketing, dan lainnya.
- Wajib memilih akun kas/bank, kategori, tanggal, jumlah, dan catatan.

**F-FIN-03 — Pembayaran dan Cicilan**
- Penjualan Tunai/Transfer membuat penerimaan penuh ketika transaksi dikonfirmasi.
- Penjualan Cicilan membuat saldo piutang; hanya pembayaran yang benar-benar diterima masuk ke jurnal kas.
- Pembayaran servis dicatat saat uang diterima, bukan hanya ketika status servis berubah.
- Sistem menampilkan sisa piutang dan menolak total pembayaran melebihi nilai tagihan.

**F-FIN-04 — Laporan Finance**
- Arus kas per periode dan akun.
- Pendapatan per sumber: Sales, Servis, dan Lainnya.
- Pengeluaran per kategori: pembelian unit, restock part, jasa/upgrade eksternal, dan operasional.
- Piutang terbuka dan umur piutang.
- Laba rugi sederhana: pendapatan diakui dari transaksi selesai, dikurangi HPP unit terjual, biaya part/jasa servis yang terpakai, dan biaya operasional. Pembelian stok yang belum terjual tetap diperlakukan sebagai persediaan, bukan langsung beban laba rugi.
- **Export CSV spreadsheet**: `GET /api/reports/export` menyediakan lima dataset (`margin`, `turnover`, `leads`, `catalog-summary`, `catalog-top-units`) dalam format CSV dengan UTF-8 BOM dan formula protection (apostrof `'` di awal sel teks berbahaya). Dataset `catalog-*` hanya berisi data agregat — tidak ada raw event atau identitas session. Parameter `start`/`end` atau `days=7|30`, wajib salah satu. Hanya Admin/Owner.
- **Tampilan Reports**: mobile (`< md`) menampilkan kartu per dataset; desktop (`>= md`) menampilkan tabel penuh.

**F-FIN-05 — Modal Disetor**
1. Admin mencatat manual saat menyuntikkan dana pribadi/eksternal ke kas toko (mis. modal awal buka toko, tambahan modal buat beli stok).
2. Input: akun kas/bank tujuan, jumlah, tanggal, catatan sumber dana.
3. Sistem catat sebagai `finance_transactions` kategori `Modal Disetor`, arah `Masuk`, `source_module = 'Manual'`.
4. Tujuan: saldo kas hasil hitungan sistem dapat direkonsiliasi ke saldo kas/rekening fisik — tanpa entri ini, suntikan modal owner tidak punya tempat tercatat dan saldo sistem akan selalu meleset dari kenyataan.

**F-FIN-06 — Retur Unit / Servis (Owner only)**
1. **Hanya role `owner`** yang dapat membuka aksi "Proses Retur" dari detail Sales/Servis — Admin dapat melihat status Retur (kalau ada) tapi tombol/endpoint aksinya tidak tersedia untuknya. Ini konsekuensi langsung dari keputusan desain: Admin tidak boleh bisa membatalkan/menghapus unit yang sudah `Terjual` (mengubah data finansial & stok yang sudah final) tanpa sepengetahuan Owner — daripada bikin mekanisme "hapus unit terjual" terpisah, Retur yang sudah ada cukup dipersempit aksesnya.
2. Owner isi alasan dan jumlah refund.
3. Sistem, dalam satu transaksi database:
   - Insert row `returns` (status awal `Diproses`).
   - Kembalikan `units.status` dari `Terjual` ke `Ready` (retur unit) — unit menjadi bisa dijual ulang.
   - Set `warranty.status` unit terkait menjadi `Habis` (garansi lama tidak berlaku lagi setelah retur).
   - Insert `finance_transactions` kategori `Retur Unit`/`Retur Servis`, arah `Keluar` sebesar `jumlah_refund`, `source_module = 'Retur'`.
   - Insert row ke `admin_actions_log` (lihat §2.9) — aksi Retur selalu tercatat siapa Owner yang memprosesnya.
4. Row `sales`/`service_orders` asli **tidak dihapus** — tetap ada sebagai riwayat, retur adalah event tertaut terpisah.
5. Status retur diubah ke `Selesai` setelah refund benar-benar dibayarkan, atau `Ditolak` jika retur tidak disetujui (tidak ada dampak finance jika ditolak).

**Titik integrasi otomatis:**

| Event sumber | Dampak Finance |
|---|---|
| Unit baru masuk | Kas keluar kategori Pembelian Unit sebesar `modal_awal` |
| Restock Bank Stock | Kas keluar kategori Pembelian Part sebesar nilai restock |
| Upgrade jasa luar tanpa part | Kas keluar kategori Biaya Upgrade Eksternal |
| Sales Tunai/Transfer | Kas masuk kategori Penjualan Unit sebesar pembayaran diterima |
| Sales Cicilan | Piutang terbentuk; kas masuk per pembayaran cicilan |
| Servis dibayar | Kas masuk kategori Pendapatan Servis sebesar pembayaran diterima |
| Operasional | Kas keluar dari form Finance manual |
| Modal Disetor | Kas masuk kategori Modal Disetor, dari form Finance manual |
| Retur Unit/Servis | Kas keluar kategori Retur Unit/Retur Servis, unit kembali `Ready`, warranty jadi `Habis` |

**Aturan akses:**
- Modul Finance (`finance_accounts`, `finance_transactions`, `receivables`, `finance_payments`, `returns`) hanya dapat diakses role `admin` dan `owner`. Role `teknisi` tidak mendapat akses baca maupun tulis sama sekali — ditegakkan lewat RLS policy eksplisit (lihat `SPEC.md` §3.1 poin 11), bukan sekadar mengikuti aturan read-only umum di modul lain.
- Di dalam Finance sendiri ada pembagian lebih halus: Admin dapat **input** transaksi harian (Operasional, Modal Disetor, konfirmasi pembayaran) tapi **tidak dapat mengoreksi/reversal** transaksi yang sudah tercatat, dan **tidak dapat memproses Retur**. Kedua aksi itu **role `owner` only** — lihat F-FIN-01 poin 3 dan F-FIN-06.

**Aturan anti-double-count:**
- Pemakaian part dari Bank Stock tidak membuat kas keluar baru karena uang sudah keluar saat restock.
- Pemakaian part tetap masuk perhitungan HPP/biaya pekerjaan untuk laporan laba rugi melalui snapshot biaya part.
- Event yang sama tidak boleh membentuk lebih dari satu transaksi finance.

## 2.8 Reservasi (DP) — Uang Muka Unit

**F-RSV-01 — Buat Reservasi**
1. Admin/Owner membuka `/sales/new`. Langkah pertama memilih unit `Ready`/`Listed`, customer existing atau customer baru, lalu jenis transaksi **Reservasi**.
2. Masukkan jumlah DP (> 0, < harga kesepakatan), harga kesepakatan, refundable (default true), dan batas waktu reservasi (default +30 hari), lalu konfirmasi langsung. **F-SLS-02 tidak dijalankan saat membuat reservasi**; pengujian dilakukan saat reservasi dilanjutkan menjadi Sales.
3. Sistem dalam satu transaksi atomik:
   - Canonicalkan payload dan validasi idempotency key sebelum mutasi customer (replay sama aman, payload berbeda ditolak).
   - Validasi tepat satu mode customer: pilih customer existing atau buat customer baru. Customer baru dibuat/reuse berdasarkan WA canonical dalam transaksi yang sama; kegagalan reservasi tidak meninggalkan customer yatim dan profil existing tidak ditimpa.
   - Validasi unit status `Ready`/`Listed` dan `expires_at` di masa depan.
   - Insert `reservations` (status `Dipesan`).
   - Ubah `units.status` ke `Dipesan`.
   - Catat finance: kategori `Uang Muka Reservasi`, arah `Masuk`, jumlah = `dp_amount`.
   - Log `admin_actions_log` (aksi `create_reservation`).
4. Satu unit hanya boleh memiliki satu reservasi `Dipesan` aktif (partial unique index).
5. Ketentuan reservasi dan `request_payload` canonical **immutable** setelah create — trigger `protect_reservation_terms` menolak perubahan.

**F-RSV-02 — Lunasi Reservasi (lanjut ke Penjualan)**
1. Admin/Owner membuka tab Reservasi di `/sales`, lalu pada reservasi `Dipesan` memilih **Lanjutkan ke Sales**.
2. Sistem menampilkan sisa pelunasan, lalu user mengisi form F-SLS-02 lengkap (12 kategori test, buyer acknowledgement) + channel, metode bayar (Tunai/Transfer saja di v1), dan durasi garansi.
3. Sistem dalam satu transaksi atomik:
   - Reverse DP: finance `Keluar`, `Uang Muka Reservasi`, `is_reversal=true`, `reversal_of=id_dp_transaction`.
   - Panggil `create_sale` di `agreed_price` penuh (termasuk test F-SLS-02, warranty trigger existing).
   - Reservasi → `Selesai`, `completed_at` tercatat.
   - Log `admin_actions_log` (aksi `complete_reservation`).
4. Net finance: +dp (create), −dp (reversal), +full agreed_price (sale) = agreed_price penuh. Revenue tercatat penuh, bukan sisa setelah DP.
5. **Ditolak** bila `expires_at` sudah lewat, metode bayar Cicilan, atau reservasi tidak berstatus `Dipesan`.
6. `POST /api/sales` menolak unit `Dipesan` di route level — hanya jalur completion yang dapat menjual unit reservasi.

**F-RSV-03 — Refund DP (Owner only)**
1. Owner membuka tab Reservasi di `/sales` pada reservasi `Dipesan` dengan `is_refundable = true`.
2. Klik "Refund DP", konfirmasi.
3. Sistem dalam satu transaksi atomik:
   - Finance: cash-out reversal (Keluar, Uang Muka Reservasi, is_reversal=true, reversal_of=dp_txn). Net cash = 0.
   - Kembalikan `units.status` ke `previous_status` (Ready/Listed).
   - Reservasi → `Dibatalkan`, `cancelled_at` tercatat.
   - Log `admin_actions_log` (aksi `refund_reservation`).
4. **Ditolak** bila `is_refundable = false`, atau status bukan `Dipesan`. **Hanya Owner** — admin mendapat 403.

**F-RSV-04 — Hanguskan DP (Admin/Owner)**
1. Admin/Owner membuka tab Reservasi di `/sales` pada reservasi `Dipesan` dengan `is_refundable = false`.
2. Klik "Hanguskan DP", konfirmasi.
3. Sistem dalam satu transaksi atomik:
   - **Tidak ada entri finance baru.** DP sudah dibukukan saat create; P&L mengakui via `pendapatan_dp_hangus` (dibaca dari `reservations.dp_amount` untuk status `Hangus`).
   - Kembalikan `units.status` ke `previous_status`.
   - Reservasi → `Hangus`, `forfeited_at` tercatat.
   - Log `admin_actions_log` (aksi `forfeit_reservation`).
4. **Ditolak** bila `is_refundable = true`, atau status bukan `Dipesan`.

**Aturan overdue:**
- `complete_reservation` ditolak bila `expires_at < clock_timestamp()`.
- `refund_reservation` dan `forfeit_reservation` tetap tersedia — Owner/Admin tetap dapat menyelesaikan reservasi yang lewat batas.
- Tidak ada auto-resolution. Reservasi overdue tetap `Dipesan` dan unit tetap terkunci sampai ada aksi manual.

**Tampilan:**
- `/sales` menjadi surface tunggal dengan tab Penjualan dan Reservasi; tab Reservasi menyediakan filter status, card mobile, table desktop, serta aksi **Lanjutkan ke Sales** / Refund / Hangus untuk status `Dipesan`.
- `/sales/new` menangani dua cabang: Penjualan Langsung → F-SLS-02 → konfirmasi; Reservasi → detail DP/expiry → konfirmasi tanpa F-SLS-02.
- `/sales/new?reservation=<id>` menangani completion reservasi dan wajib menjalankan F-SLS-02.
- Detail unit hanya menjadi shortcut ke surface Sales. `/reservations` dipertahankan sebagai compatibility redirect; tidak ada item navigasi Reservasi terpisah.

## 2.9 Pengaturan & Manajemen Akun (Modul 10, Owner only)

**Keputusan desain:** role tetap 3 tingkat (`owner` > `admin` > `teknisi`), **bukan** permission matrix granular per pengguna — lihat alasan di `AGENTS.md` §11. Kalau di masa depan kebutuhannya berubah (lebih dari 1-2 admin dengan tingkat kepercayaan berbeda-beda), baru pertimbangkan layer permission opsional di atas role ini; jangan dibangun sekarang karena tidak proporsional dengan skala bisnis saat ini (`BRD.md` §5).

**F-SET-01 — Manajemen Akun (Owner only)**
1. Owner dapat melihat daftar semua akun (Owner/Admin/Teknisi) beserta status aktif/nonaktif dan tanggal dibuat.
2. Owner dapat membuat akun baru (Admin atau Teknisi) — input email, role, nama.
3. Owner dapat menonaktifkan akun (Admin/Teknisi/Owner lain) — **bukan hard delete**, supaya riwayat `created_by`/`changed_by` di tabel lain (upgrade_log, unit_spec_history, finance_transactions, returns, dst) tetap valid secara referensial.
4. **Proteksi self-lockout**: sistem menolak menonaktifkan akun `owner` terakhir yang masih aktif — harus ada minimal 1 Owner aktif setiap saat.
5. Admin dan Teknisi **tidak punya akses sama sekali** ke halaman/endpoint manajemen akun (bukan cuma disembunyikan di UI — RLS eksplisit).
6. Setiap create/nonaktifkan akun tercatat ke `admin_actions_log` (lihat F-SET-03).

**F-SET-02 — Pengaturan Aplikasi (`app_settings`)**
1. Owner dapat melihat dan mengubah nilai `app_settings` lewat UI — bukan lagi lewat SQL manual. Enam key aktif: `default_warranty_unit_days`, `default_warranty_service_days`, `replacement_grace_days`, `stock_aging_alert_days`, `store_whatsapp_number`, dan `store_google_maps_url`.
2. Admin dapat **melihat** (read-only) nilai `app_settings` yang relevan dengan pekerjaannya sehari-hari (mis. durasi garansi default saat lihat form Sales) tapi tidak bisa mengubahnya.
3. Setiap perubahan `app_settings` tercatat ke `admin_actions_log` dengan nilai lama dan baru.
4. Perubahan `app_settings` **tidak berlaku surut** — transaksi yang sudah terbentuk (mis. `sales.durasi_garansi_hari` yang sudah tersimpan) tidak berubah walau default-nya diubah belakangan (konsisten dengan prinsip di `SPEC.md` §3, catatan APP SETTINGS).

**F-SET-03 — Audit Log Aksi Sensitif (`admin_actions_log`)**
1. Aksi yang wajib tercatat: create/nonaktifkan akun, ubah `app_settings`, reversal/koreksi Finance (F-FIN-01 poin 3), proses Retur (F-FIN-06).
2. Setiap entri log menyimpan: siapa (user id + role saat itu), aksi apa, target (akun/setting/transaksi terkait), waktu, dan detail perubahan (nilai lama → baru bila relevan).
3. Log ini **read-only** dari UI — tidak ada fitur edit/hapus log, termasuk oleh Owner sendiri.
4. Halaman "Log Aktivitas" (Owner only) menampilkan log ini terurut waktu terbaru, dengan filter by jenis aksi dan by aktor.

**Aturan akses (F-SET):**
- Seluruh Modul 10 (`F-SET-01` s.d. `F-SET-03`) adalah **Owner only** — tidak ada bagian yang bisa diakses Admin atau Teknisi, ditegakkan lewat RLS eksplisit sama seperti pola Finance di §2.7.

## 2.10 Katalog Publik (Modul 11)

**Keputusan scope** (dikonfirmasi Owner): hanya katalog di situs sendiri. Integrasi WhatsApp Catalog (Meta Commerce), Instagram auto-post, dan Facebook Marketplace **ditunda**, bukan bagian fase ini (lihat `BRD.md` §3). Alasan teknis: WhatsApp Catalog & Instagram butuh setup Meta Business Manager + verifikasi bisnis; Facebook Marketplace API auto-post malah tidak tersedia untuk developer umum (hanya partner commerce yang di-approve khusus oleh Meta).

**F-CAT-01 — Halaman Katalog (`/katalog`, publik, tanpa login)**
1. Menampilkan grid unit dengan `status = 'Listed'` **dan** `harga_listing is not null`. Unit `Ready` tanpa `harga_listing`, unit `Delisted`, atau status lain, tidak muncul.
2. Tiap kartu: foto utama (elemen pertama `foto_url[]`), brand, model, `spek_saat_ini` satu baris, dan `harga_listing`. Grade tidak ditampilkan di katalog publik dan tidak dikembalikan RPC publik; data `kondisi_fisik` internal tetap utuh.
3. **Tidak menampilkan** `modal_awal`, `total_modal`, `serial_number` — perluasan eksplisit dari BR-05 (customer publik tidak pernah melihat data internal) ke konteks katalog.
4. Halaman ini tidak memakai sidebar/nav admin (pola sama seperti `/s/[id_servis]`, berdiri sendiri, tidak butuh auth).
5. Data di-refresh berkala (revalidate tiap 30–60 detik), bukan realtime — perubahan status/harga unit tidak sesering itu.
6. **Filter harga** tampil sebagai chip langsung: Semua harga, < Rp2 juta, Rp2–5 juta (inklusif), dan > Rp5 juta. **Urutan** dibuka lewat bottom sheet (`<dialog>` native): Termurah, Termahal, Terbaru, Terlama. Pilihan filter/sort saling dipertahankan di query URL dan tidak memakai horizontal scroll.

**F-CAT-02 — Halaman Detail Unit (`/katalog/[id_unit]`, publik)**
1. Foto lebih lengkap (galeri dari seluruh `foto_url[]`), spek detail (`spek_saat_ini`), kondisi fungsi, dan `harga_listing`. Grade/kondisi fisik internal tidak ditampilkan.
2. **Catatan data penting**: `spek_saat_ini` adalah **satu kolom teks bebas** (bukan kolom Processor/RAM/Storage/Layar terpisah — lihat `SPEC.md` §3, tabel `units`). Tampilkan sebagai satu blok teks apa adanya hasil input admin, **jangan** di-parse jadi baris tabel per-komponen seakan-akan itu field terstruktur berbeda.
3. Di halaman grid (F-CAT-01), tampilkan `spek_saat_ini` sebagai **satu baris teks** (truncated dengan ellipsis kalau kepanjangan) — **jangan** split by koma jadi beberapa chip terpisah. Selain berisiko keliatan seolah field terstruktur (kebalik dari poin 2), splitting itu juga rapuh — bergantung admin konsisten pakai koma sebagai pemisah saat input, yang tidak dijamin.
4. Tombol "Hubungi via WhatsApp" — link `wa.me/<store_whatsapp_number>?text=<pesan pre-filled menyebut id_unit dan brand/model>`. Nomor WA toko diambil dari `app_settings.store_whatsapp_number`; setting kosong menghasilkan tombol disabled.
5. Floating action **Bagikan** memakai Web Share API di perangkat yang mendukung dan fallback salin URL ke clipboard. Action **Buka lokasi** membuka `app_settings.store_google_maps_url`; setting kosong menghasilkan state disabled. Mobile menempatkan dua action tepat di atas WhatsApp, desktop lebar menampilkan rail floating di kanan.
6. **Open Graph meta tag** (title, description, image, harga) di-generate per halaman dari data unit — supaya link yang dibagikan menampilkan preview foto+harga.
7. Kalau `id_unit` tidak ditemukan atau statusnya sudah bukan `Listed`, tampilkan halaman "unit tidak tersedia" — bukan error mentah atau redirect diam-diam.

**F-CAT-03 — Analytics Katalog Anonim**
1. Browser membuat satu UUID acak first-party dan menyimpannya di `localStorage`; UUID ini hanya dipakai sebagai perkiraan visitor unik, bukan identitas customer.
2. Sistem mencatat empat event: `catalog_view` saat katalog dibuka, `detail_view` saat detail unit Listed dibuka, `whatsapp_click` saat tombol WhatsApp diklik, dan `share_click` saat tombol Bagikan ditekan sebelum native share/clipboard dicoba. Pembatalan share sheet atau kegagalan clipboard tetap dihitung sebagai klik; event ini bukan bukti link terkirim.
3. Kombinasi tanggal Jakarta, session, jenis event, dan unit dicatat paling banyak satu kali agar refresh/render ulang tidak menggandakan statistik, tetapi kunjungan kembali pada hari berikutnya tetap terukur. `catalog_view` tidak memiliki `id_unit`; tiga event lain wajib memiliki unit Listed yang valid.
4. Role tidak pernah dikirim oleh browser. Server/database membaca JWT: event dari sesi login `owner`, `admin`, atau `teknisi` ditandai internal dan dikecualikan dari laporan utama.
5. Staf yang membuka katalog tanpa sesi login (termasuk incognito) tidak dapat dibedakan dari customer dan tetap dihitung publik. Sistem tidak menggunakan IP atau fingerprinting untuk menebaknya.
6. Data yang disimpan: jenis event, UUID session anonim, `id_unit` opsional, flag internal, waktu, dan **label sumber trafik terklasifikasi** (`traffic_source`, max 48 char: `direct`, `google`, `instagram`, `utm:campaign-name`, dsb.). **Tidak** disimpan: IP, user agent, URL referrer mentah, lokasi, email, nomor WA, identitas customer.
7. Sumber trafik ditangkap sekali per tab (`sessionStorage`) dari `utm_source`/`utm_medium`/`utm_campaign` (prioritas) atau hostname referrer yang diklasifikasi. Navigasi same-site katalog→detail dihitung `direct` (bukan sumber eksternal).
8. Halaman Laporan Admin/Owner menampilkan periode tetap 7 dan 30 hari: visitor unik, detail view, klik WhatsApp, klik Bagikan, rasio `whatsapp_click / detail_view`, lima unit teratas, dan **tabel sumber trafik** (pengunjung / detail / WA per label). Teknisi dan publik tidak dapat membaca laporan atau tabel event mentah.

**Dependensi yang wajib diverifikasi sebelum implementasi (bukan diasumsikan):**
- Foto unit diupload lewat signed URL flow ke Supabase Storage (§2.1 F-STK-05). **Perlu dicek eksplisit**: apakah bucket/path foto bersifat publicly-readable atau private? Kalau private (lebih mungkin, karena ini aplikasi inventori internal), halaman katalog publik **tidak bisa** langsung hotlink `foto_url` — perlu salah satu: (a) policy Storage read-only public khusus untuk foto unit berstatus `Listed`, atau (b) route API yang men-generate signed URL dengan TTL panjang khusus dipanggil dari halaman katalog. Ini **wajib** diverifikasi sebagai task pertama Fase Katalog, bukan diasumsikan otomatis jalan.

**Business Rule tambahan:**

| Kode | Aturan |
|---|---|
| BR-09 | Halaman katalog publik (`/katalog`, `/katalog/[id_unit]`) tidak pernah menampilkan data finansial internal (modal, margin) atau data yang bisa disalahgunakan (serial number) — hanya data yang memang ditujukan untuk calon pembeli melihat |
| BR-10 | Penggantian unit garansi tidak membuat Sales/revenue penuh kedua. Invoice asli immutable; hanya selisih aktual yang masuk Finance dan unit rusak wajib kembali ke QC. |
| BR-11 | Pre-payment unit testing (F-SLS-02) bersifat atomic dengan sale: test wajib selesai sebelum konfirmasi jual, hasil test immutable setelah sale, dan tidak ada status unit baru (`Testing` atau sejenisnya) — unit tetap `Ready`/`Listed` sampai sale final |
| BR-12 | Satu unit hanya boleh memiliki satu reservasi aktif (`Dipesan`). Ketentuan reservasi (dp_amount, agreed_price, is_refundable, expires_at) immutable setelah create. Overdue tidak auto-resolve — reservasi tetap terkunci sampai ada aksi manual (refund/forfeit). DP non-refundable yang hangus diakui sebagai pendapatan (`pendapatan_dp_hangus`) di P&L langsung dari tabel reservations, bukan dari finance_transactions. |
