
# BJ Laptop — Brand & Color Guide
v1.0 · Juli 2026

## 1. Identitas Merek

BJ Laptop menggunakan logo kubus isometrik dengan tulisan **LAPTOP** pada sisi atas dan monogram **BJ** pada dua sisi depan. Bentuk kubus menegaskan sistem, inventori, dan keteraturan; konstruksi geometris memberi kesan teknis, modern, dan tepercaya.

## 2. Aset Logo Resmi

| Varian | File | Pemakaian |
|---|---|---|
| Logo hitam | `logo-black.png` | Latar putih atau warna sangat terang |
| Logo putih | `logo-white.png` | Latar hitam, hijau utama, oranye, foto gelap, atau bidang berwarna kuat |
| Logo vektor | `logo-vector.svg` | Cetak, signage, stiker, dan kebutuhan skala besar |

### Clear space
Gunakan ruang kosong minimum sebesar **1/4 lebar logo** di seluruh sisi. Jangan menempatkan teks, ikon, garis, atau tepi kartu di area ini.

### Ukuran minimum
- Digital: lebar minimum 32 px untuk ikon sederhana; 64 px untuk tampilan logo penuh.
- Cetak: lebar minimum 12 mm.

### Larangan
- Jangan meregangkan atau memipihkan logo.
- Jangan memutar, memiringkan, atau mengubah perspektif.
- Jangan mengganti warna logo di luar hitam atau putih tanpa versi resmi.
- Jangan menambahkan outline, drop shadow, glow, bevel, atau efek 3D tambahan.
- Jangan meletakkan logo putih di latar terang atau logo hitam di latar gelap.
- Jangan memotong bagian kubus atau tulisan pada logo.

## 3. Palet Warna Utama

| Peran | Nama | Hex | RGB | Penggunaan utama |
|---|---|---:|---:|---|
| Primary | BJ Green | `#198929` | 25, 137, 41 | Navigasi, tombol utama, status positif, elemen identitas |
| Secondary | BJ Orange | `#FF751F` | 255, 117, 31 | CTA sekunder, peringatan, penekanan transaksi |
| Accent | BJ Yellow | `#FFDC50` | 255, 220, 80 | Highlight, badge perhatian, informasi penting |

Rasio visual yang disarankan: **60% netral/putih, 25% hijau, 10% oranye, 5% kuning**. Warna brand tidak harus memenuhi seluruh layar; ruang putih tetap dominan agar aplikasi operasional mudah dibaca.

## 4. Warna Pendukung UI

| Token | Nilai | Fungsi |
|---|---:|---|
| Background | `#F7FAF7` | Latar halaman |
| Surface | `#FFFFFF` | Kartu, modal, tabel |
| Text Primary | `#172019` | Teks utama |
| Text Secondary | `#5E6B61` | Teks pendukung |
| Border | `#DDE5DE` | Garis pemisah dan input |
| Danger | `#C62828` | Error, hapus, stok kosong |
| Info | `#1769AA` | Informasi netral |

## 5. Kontras dan Keterbacaan

- Gunakan **teks putih** di atas `#198929` dan `#FF751F`.
- Gunakan **teks hitam/gelap** di atas `#FFDC50`.
- Jangan menggunakan kuning sebagai warna teks pada latar putih.
- Untuk tombol disabled, gunakan netral abu-abu; jangan menurunkan opacity warna brand sampai teks sulit dibaca.
- Warna tidak boleh menjadi satu-satunya penanda status. Selalu sertakan label teks atau ikon.

## 6. Pemetaan Warna ke BJ Stock

| Komponen | Warna |
|---|---|
| Sidebar/header aktif | BJ Green |
| Tombol aksi utama, Simpan, Konfirmasi | BJ Green |
| Tombol aksi sekunder, Tambah biaya, Proses | BJ Orange |
| Badge perlu perhatian / jatuh tempo | BJ Yellow + teks gelap |
| Status berhasil / Ready / Aktif | BJ Green |
| Status proses / Diagnosa / Dikerjakan | BJ Orange |
| Status peringatan / hampir habis | BJ Yellow |
| Status gagal / stok kosong / lewat tempo | Danger |
| QR label dan invoice customer | Logo hitam pada putih; aksen hijau seperlunya |

## 7. Token CSS Awal

```css
:root {
  --brand-primary: #198929;
  --brand-secondary: #ff751f;
  --brand-accent: #ffdc50;
  --background: #f7faf7;
  --surface: #ffffff;
  --text-primary: #172019;
  --text-secondary: #5e6b61;
  --border: #dde5de;
  --danger: #c62828;
  --info: #1769aa;
}
```

## 8. Implementasi Logo pada Aplikasi

- Login dan halaman publik: logo hitam pada kartu putih.
- Sidebar hijau: logo putih.
- Invoice dan nota: logo hitam agar aman untuk printer monokrom.
- Favicon/app icon: gunakan versi kubus yang tetap terbaca pada ukuran kecil; jangan memaksakan seluruh detail tulisan jika tidak terbaca.
