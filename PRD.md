# PRD — Product Requirements Document
## BJ Stock
v1.0 · Juli 2026

---

## 1. Ringkasan Produk

BJ Stock adalah web app internal untuk mengelola siklus penuh unit laptop second (masuk → servis/upgrade → jual → garansi) dan jasa servis umum (repair/install/cleaning), terintegrasi dengan CRM pelanggan, menggunakan QR code sebagai titik akses utama tiap unit/order.

## 2. Persona Pengguna

| Persona | Deskripsi | Kebutuhan |
|---|---|---|
| Owner | Pemilik bisnis, superset Admin | Kontrol penuh: manajemen akun, pengaturan aplikasi, koreksi finance, proses retur unit terjual |
| Admin/Kasir | Operasional harian: transaksi jual & servis | Alur cepat via scan QR, minim klik; tidak bisa koreksi/hapus data finansial final |
| Teknisi | Kerjakan servis/upgrade | Update status pekerjaan, catat part terpakai |
| Customer (tidak login) | Cek status servis | Akses read-only via link/QR pada tanda terima |

## 3. Modul Produk & Fitur

### Modul 1 — Stock Masuk (Inventory)
- Input unit baru: brand/model, serial number, spek, kondisi fisik/fungsi, sumber beli, modal awal.
- Upload foto (before servis, after servis).
- Generate ID unit otomatis format `BJ-[BRAND]-[YYMM]-[URUT]`.
- Generate QR code otomatis saat unit dibuat.
- Status lifecycle: `Masuk → QC → Ready → Listed → Terjual → Selesai`.
- Delisting: unit yang rusak parah, diretur ke supplier, salah input, atau hilang dapat di-delist (status `Delisted`) tanpa menghapus data. Reversal finance otomatis untuk retur supplier dan salah input.
- Reactivate: unit `Delisted` dapat dikembalikan ke `Ready` (kasus jarang, mis. unit ditemukan kembali).
- Pencarian & filter (brand, status, rentang tanggal masuk).

### Modul 2 — Bank Stock (Spare Part)
- CRUD part: jenis, kondisi (baru/copotan), qty, modal per unit, sumber.
- Riwayat pemakaian part (ke unit mana / ke servis order mana).
- Alert stok part menipis (opsional, fase lanjut).

### Modul 3 — Upgrade Log
- Catat pemasangan part ke unit tertentu.
- Otomatis: kurangi qty Bank Stock, tambah `total_modal` unit terkait.

### Modul 4 — Sales
- Scan QR unit → form transaksi (data pembeli, harga jual, channel, metode bayar).
- Auto-generate invoice.
- Auto-hitung margin (harga jual − total modal).
- Auto-update status unit → Terjual, generate garansi.

### Modul 5 — Aftersales (Garansi)
- Garansi otomatis terbentuk saat unit terjual (durasi default dapat dikonfigurasi, mis. 30 hari).
- Klaim garansi: keluhan, tindakan, biaya (jika ada biaya di luar cakupan garansi), status.
- Lookup riwayat garansi via scan QR unit.

### Modul 6 — Servis Umum (Repair / Install / Cleaning)
- Berlaku untuk dua kasus:
  a. Servis atas unit yang dijual sendiri (terhubung ke `id_unit` & garansi).
  b. Servis umum atas laptop milik customer luar (tidak punya `id_unit` internal).
- Form penerimaan servis: jenis servis (Repair/Install/Cleaning), brand/model laptop customer, keluhan, dan estimasi selesai opsional.
- Generate `id_servis` + QR tanda terima sementara.
- Status: `Diterima → Diagnosa → Dikerjakan → Selesai → Diambil`.
- Diagnosa & tindakan teknisi, part terpakai (link ke Bank Stock), biaya jasa + biaya part → total biaya.
- Garansi servis (durasi pendek, mis. 7–14 hari) dimulai saat perangkat diambil customer.
- Customer dapat cek status via scan QR pada tanda terima (read-only, tanpa login).

### Modul 7 — CRM
- Profil customer: nama, kontak WA, segmen (pelajar/orang tua/remote worker), sumber lead.
- Riwayat gabungan: pembelian unit + histori servis dalam satu profil.
- Reminder (fase lanjut): garansi akan habis, follow-up repeat order.

### Modul 8 — Dashboard & Laporan (fase akhir)
- Margin per brand/periode.
- Kecepatan perputaran stock (rata-rata hari dari Masuk ke Terjual).
- Distribusi sumber lead vs. konversi penjualan/servis.

## 4. Prioritas Fitur (MoSCoW)

| Fitur | Prioritas |
|---|---|
| CRUD Unit + QR generate | Must |
| Scan QR lookup unit | Must |
| Bank Stock + Upgrade Log | Must |
| Transaksi Sales via scan QR | Must |
| Garansi otomatis | Must |
| Servis Umum (Modul 6) | Must |
| CRM dasar (profil + riwayat) | Must |
| Cek status servis oleh customer (public link) | Should |
| Reminder otomatis garansi/follow-up | Should |
| Dashboard & laporan | Could |
| Alert stok part menipis | Could |
| Manajemen Akun & Pengaturan (Modul 10) | Must — menutup gap keamanan aktif (Admin saat ini bisa reversal finance & retur unit terjual tanpa batas) |
| Integrasi marketplace/e-commerce | Won't (fase ini) |

## 5. Kebutuhan Non-Fungsional

- **Kecepatan**: proses scan-ke-hasil di bawah 2 detik pada koneksi mobile normal.
- **Aksesibilitas**: dapat diakses dari browser HP admin (kamera untuk scan QR) tanpa instalasi app.
- **Keamanan**: autentikasi admin/teknisi wajib; halaman cek status customer bersifat read-only tanpa login.
- **Reliabilitas data**: semua perhitungan (total modal, margin, biaya servis) dihitung server-side, bukan manual, untuk mencegah kesalahan input.
- **Skalabilitas**: struktur data harus mendukung penambahan modul baru (mis. multi-cabang) tanpa migrasi besar.

## 6. Metrik Sukses Produk

- 100% unit baru memiliki QR code aktif sejak hari pertama pemakaian sistem.
- 0 selisih perhitungan margin manual vs sistem.
- Waktu rata-rata pencarian riwayat unit/servis saat klaim < 15 detik.

### Modul 9 — Finance
- Jurnal kas otomatis dari pembelian unit, restock part, penjualan, servis, dan biaya eksternal.
- Input manual biaya operasional yang tidak berasal dari modul lain.
- Multi akun kas/bank sederhana.
- Dukungan pembayaran penuh dan cicilan/piutang.
- Arus kas, pengeluaran per kategori, pendapatan per sumber, piutang terbuka, serta laba rugi sederhana.
- Sistem mencegah double-input dan double-count melalui referensi event sumber yang unik.
- **Koreksi/reversal transaksi dan proses Retur adalah aksi Owner-only** — Admin bisa input transaksi harian tapi tidak bisa mengoreksi/membatalkan yang sudah tercatat (lihat Modul 10).

### Modul 10 — Pengaturan & Manajemen Akun (Owner only)
- Manajemen akun: buat/nonaktifkan Admin & Teknisi, lihat daftar seluruh akun. Proteksi agar Owner terakhir tidak bisa dinonaktifkan sendiri.
- Pengaturan aplikasi (`app_settings`) lewat UI — durasi garansi default, ambang alert stok lama, dll — bukan lagi lewat SQL manual.
- Log aktivitas: audit trail read-only untuk semua aksi sensitif (manajemen akun, ubah pengaturan, koreksi finance, proses retur).
- **Keputusan desain**: 3 role tetap (Owner/Admin/Teknisi), bukan permission matrix granular per pengguna — proporsional untuk skala tim 1-2 admin saat ini (lihat `BRD.md` §5, `AGENTS.md` §11).
