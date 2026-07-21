# BRD — Business Requirements Document
## BJ Stock: Sistem Manajemen Stock, Sales, Aftersales, Servis & CRM
**BJ Laptop, Bangunjiwo** · Juli 2026 · v1.0

---

## 1. Latar Belakang Bisnis

BJ Laptop menjual laptop second dan menerima jasa servis (repair, install, cleaning). Saat ini proses stock, penjualan, garansi, servis, dan data pelanggan dikelola manual/terpisah (nota fisik, chat WA, catatan pribadi), yang menyebabkan:

- Riwayat unit (kondisi, upgrade, modal) tidak konsisten tercatat.
- Perhitungan margin sering meleset karena biaya upgrade tidak otomatis terhitung.
- Klaim garansi/servis lambat ditangani karena pencarian riwayat manual.
- Tidak ada data pelanggan terpusat untuk follow-up repeat order.
- Servis umum (bukan unit yang dijual sendiri) belum punya alur pencatatan sama sekali.

## 2. Tujuan Bisnis

| # | Tujuan | Indikator Keberhasilan |
|---|---|---|
| 1 | Mempercepat operasional harian (cek stock, transaksi, servis) | Waktu transaksi per unit turun (target: di bawah 2 menit dari scan sampai selesai) |
| 2 | Margin per unit terhitung akurat | Total modal (termasuk upgrade) selalu tercatat otomatis, tanpa selisih manual |
| 3 | Meningkatkan kepercayaan pelanggan lewat garansi & servis yang tertelusur | Riwayat servis/garansi bisa diakses < 10 detik via scan QR |
| 4 | Membangun basis data pelanggan untuk repeat order | Semua transaksi (beli & servis) tercatat ke satu profil customer |
| 5 | Data untuk keputusan bisnis | Tersedia laporan margin, kecepatan perputaran stock, dan sumber lead paling efektif |
| 6 | Mengukur efektivitas katalog publik tanpa mengorbankan privasi | Tersedia visitor unik, detail view, klik WhatsApp, rasio konversi, dan unit paling diminati untuk periode 7/30 hari |
| 7 | Menangani unit rusak dalam masa garansi tanpa merusak histori penjualan dan kas | Penggantian unit tercatat end-to-end, customer memegang unit/QR/garansi aktif yang benar, dan Finance hanya mencatat selisih aktual |

## 3. Ruang Lingkup Bisnis

**Termasuk dalam scope:**
- Pencatatan stock unit laptop second (per unit, unik).
- Pengelolaan spare part (Bank Stock) sebagai stok bersama untuk upgrade unit dan servis.
- Transaksi penjualan unit.
- Garansi otomatis atas unit terjual.
- Servis umum: repair, install, cleaning — baik untuk unit yang dijual sendiri maupun laptop milik customer luar.
- CRM: profil pelanggan, riwayat pembelian & servis, sumber lead dari konten marketing.
- Pelabelan QR code per unit dan per order servis.
- Analytics anonim katalog publik untuk kunjungan, detail unit, dan klik WhatsApp; tanpa IP, fingerprint, lokasi presisi, atau identitas customer.
- Penggantian unit dalam masa garansi dengan invoice asli tetap, unit rusak kembali ke QC, unit pengganti menjadi unit aktif customer, dan penyesuaian harga tercatat sebagai selisih saja.
- Delisting unit: penanganan unit rusak parah, retur supplier, salah input, atau hilang tanpa menghapus data dari sistem (menjaga integritas finance dan audit trail).

**Di luar scope (fase awal):**
- E-commerce / marketplace listing otomatis.
- Integrasi akuntansi/pajak formal.
- Sistem payroll/karyawan.
- Aplikasi mobile native (fase awal berbasis web app responsif).

## 4. Stakeholder

| Peran | Kebutuhan Utama |
|---|---|
| Owner (Sidiq) | Visibilitas penuh + kontrol eksklusif: manajemen akun, pengaturan aplikasi, koreksi finance, proses retur unit terjual |
| Admin/Kasir toko | Alur transaksi cepat via scan QR, minim input manual — tidak bisa mengoreksi data finansial yang sudah final |
| Teknisi servis | Pencatatan diagnosa & tindakan servis yang simpel |
| Customer | Transparansi status servis & riwayat garansi |

## 5. Batasan & Asumsi

- Tim kecil (1–2 admin), sehingga UI harus sederhana, tidak butuh training panjang. **Model akses memakai 3 role tetap (Owner/Admin/Teknisi), bukan permission matrix granular per pengguna** — proporsional untuk skala tim saat ini; pertimbangkan ulang hanya kalau jumlah admin bertambah signifikan dengan tingkat kepercayaan yang bervariasi.
- Infrastruktur mengikuti stack yang sudah dikenal (Supabase), untuk mempercepat development solo.
- Fase awal difokuskan pada operasional inti (stock, sales, garansi, servis, CRM dasar); dashboard analitik menyusul di fase akhir.
- Anggaran pengembangan terbatas (solo developer, bertahap per fase).

### F-WRT-04 — Penggantian Unit Dalam Garansi

- Penggantian mempertahankan invoice dan jumlah Sales asli; event penggantian tidak boleh dimodelkan sebagai Cancel Sales, Retur penuh, atau penjualan baru.
- Finance hanya mencatat top-up atau refund sebesar selisih nilai unit. Penggantian dengan nilai sama tidak membuat transaksi Finance.
- Unit rusak kembali ke `QC`, unit pengganti menjadi unit aktif customer, dan garansi aktif mengikuti unit pengganti.
- Karena menyentuh data final Sales dan Finance, proses penggantian hanya dapat dijalankan Owner.

## 6. Risiko Bisnis

| Risiko | Mitigasi |
|---|---|
| Adopsi sistem oleh admin lambat (masih pakai cara lama) | UI sesederhana mungkin, alur scan QR 1x aksi untuk banyak proses |
| Data lama tidak termigrasi (histori sebelum sistem ada) | Tidak wajib migrasi data lama; sistem mulai bersih dari unit baru masuk |
| Ketergantungan pada 1 developer (solo) | Dokumentasi teknis lengkap (SPEC.md, AGENTS.md) agar mudah dilanjutkan kapan saja |
| Trafik internal mengotori statistik katalog | Kunjungan dari sesi Owner/Admin/Teknisi yang sedang login ditandai internal dan dikecualikan; akses incognito staf tetap dianggap publik karena sistem sengaja tidak memakai fingerprinting |
| Analytics publik disalahgunakan untuk mengumpulkan data pribadi | Simpan hanya event, UUID acak first-party, unit terkait, waktu, dan flag internal; jangan simpan IP, user agent, fingerprint, lokasi, atau identitas customer |
| Penggantian garansi menggandakan revenue atau membuat arus kas semu | Jangan buat sales/refund penuh baru; simpan event penggantian immutable dan catat hanya top-up/refund selisih yang benar-benar berpindah |
| Unit rusak hasil penggantian terjual kembali tanpa pemeriksaan | Status unit lama wajib kembali ke `QC`, bukan `Ready`; hanya alur QC normal yang dapat mengembalikannya ke stok jual |

## 7. Dokumen Terkait
- PRD.md — kebutuhan produk & fitur per modul
- FSD.md — spesifikasi fungsional & alur detail
- SPEC.md — skema teknis & database
- AGENTS.md — aturan pengembangan dengan AI coding agent
- TODO.md — checklist eksekusi bertahap

## 8. Kebutuhan Bisnis Finance

Finance dibutuhkan sebagai lapisan konsolidasi, bukan tempat input ulang transaksi dari modul operasional. Setiap arus uang yang sudah terjadi di Stock, Bank Stock, Sales, atau Servis harus otomatis tercermin pada jurnal kas. Input manual hanya dipakai untuk biaya operasional atau transaksi lain yang tidak memiliki modul sumber.

Target bisnis:
- Owner dapat melihat posisi kas masuk/keluar tanpa merekap ulang.
- Tidak ada transaksi ganda akibat input dari dua modul.
- Pembelian stok dibedakan dari beban laba rugi agar laba tidak terlihat terlalu kecil ketika stok belum terjual.
- Penjualan cicilan dan pembayaran servis dapat dipantau sampai lunas.
- Setiap angka finance dapat ditelusuri kembali ke invoice, unit, order servis, atau event restock asalnya.
