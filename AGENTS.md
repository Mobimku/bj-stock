# AGENTS.md — Aturan Kerja untuk AI Coding Agent
## Project: BJ Stock · OpenCode + Sonnet 4.5

Baca file ini, `SPEC.md`, `FSD.md`, dan `TODO.md` di awal setiap sesi sebelum menulis kode apa pun.

---

## 1. Prinsip Umum

1. **Jangan mulai coding tanpa membaca `TODO.md`** untuk tahu task mana yang sedang dikerjakan dan statusnya.
2. **Satu sesi = satu task** dari `TODO.md`. Jangan lompat mengerjakan task lain di tengah jalan, kecuali diminta eksplisit.
3. **Jangan ubah skema database** di luar yang tertulis di `SPEC.md` tanpa membuat file migration baru dan mencatat perubahannya di `SPEC.md`.
4. **Semua perhitungan uang (modal, margin, biaya) di server-side** (Supabase function/trigger atau API route), tidak boleh cuma dihitung di frontend.
5. Setelah task selesai, **update checklist di `TODO.md`** dan tulis catatan keputusan teknis penting (jika ada) sebelum commit.

## 2. Konvensi Kode

- **Bahasa**: TypeScript strict mode aktif, no `any` tanpa alasan jelas.
- **Struktur folder**: ikuti struktur di `SPEC.md` § 2. Jangan bikin struktur folder baru tanpa alasan.
- **Naming**:
  - Tabel & kolom DB: `snake_case` (sudah sesuai `SPEC.md`).
  - Komponen React: `PascalCase`.
  - Function/variable: `camelCase`.
- **Error handling**: setiap API route wajib try/catch dan return status code yang sesuai (400 untuk validasi gagal, 500 untuk error server) — jangan biarkan error silent.
- **Validasi input**: gunakan schema validation (mis. `zod`) di setiap form/API route, sinkron dengan constraint di `SPEC.md` (mis. `modal_awal > 0`).
- **Tidak ada hardcoded credential/API key** di kode — semua lewat `.env`, dan `.env` wajib ada di `.gitignore`. Ini juga berlaku untuk password akun yang diberikan Owner secara langsung (mis. saat setup akun baru) — **jangan pernah** menuliskannya ke `TODO.md`, `HANDOFF.md`, commit message, atau file apa pun yang ter-commit ke git. Cukup catat email/identitas akun; password selalu diasumsikan sudah diketahui/diganti Owner sendiri di luar dokumentasi.
- **UI wajib mobile-first**: setiap komponen/halaman baru didesain untuk viewport 360–390px dulu, baru diperluas ke breakpoint `md`/`lg` — bukan sebaliknya (desain desktop lalu "disempitkan"). Nav mengikuti pola di `SPEC.md` §2.1. Sebelum menandai task UI selesai, cek tampilannya di viewport 360px dan 390px, bukan cuma di layar developer.

## 3. Batasan Perubahan Status

Status unit dan status servis mengikuti alur linear yang didefinisikan di `FSD.md`. Agent **tidak boleh** membuat tombol/endpoint yang mengizinkan:
- Loncat status (mis. `Masuk` langsung ke `Terjual`).
- Unit berstatus selain `Ready`/`Listed` masuk ke alur Sales.
- Mengubah `units.status` menjadi `Terjual` di luar alur `POST /api/sales`, **kecuali** RPC atomik Owner-only `replace_warranty_unit()` untuk F-WRT-04. Exception ini hanya boleh memindahkan unit pengganti dari `Ready`/`Listed` ke `Terjual`, sekaligus memindahkan unit rusak dari `Terjual` ke `QC`, menutup/membuat garansi, mencatat selisih Finance, dan menulis audit log dalam transaksi database yang sama.

Jika ada kebutuhan override manual (mis. admin perlu mundurkan status karena salah input), itu harus jadi fitur eksplisit terpisah dengan log alasan — bukan tombol edit status bebas.

Penggantian unit dalam garansi **bukan** Cancel Sales, Retur, atau penjualan baru. Agent tidak boleh memodelkannya sebagai refund penuh diikuti sales baru karena akan membuat revenue/aruskas semu dan merusak margin. Gunakan event `warranty_replacements` dan read model unit aktif sesuai F-WRT-04.

## 4. Pembagian Kerja Model (jika multi-agent routing dipakai)

| Jenis Task | Model/Agent |
|---|---|
| Desain skema, keputusan arsitektur, trigger SQL kompleks | Sonnet 4.5 (heavy) |
| CRUD boilerplate, komponen form repetitif, styling | Model ringan/cepat |
| Review & debugging logic perhitungan uang | Sonnet 4.5 (heavy) — jangan didelegasikan ke model ringan |

## 5. Testing & Verifikasi Mandiri

Sebelum menandai task selesai, agent harus:
1. Jalankan seed data contoh (buat unit dummy, part dummy, transaksi dummy).
2. Verifikasi hasil kalkulasi (`total_modal`, `margin`, `total_biaya`) sesuai hitungan manual — tampilkan perhitungan di komentar/log sebagai bukti.
3. Cek tidak ada regresi pada fitur yang sudah ada sebelumnya (jalankan flow terkait secara manual/scripted).

## 6. Git & Commit

- Commit kecil per task, bukan satu commit besar di akhir fase.
- Format pesan commit: `feat(module): deskripsi singkat — ref F-XXX-XX` (merujuk kode fungsi di `FSD.md` jika relevan).
- Jangan commit file `.env`, `node_modules`, atau file hasil build.
- Sebelum commit besar (akhir fase), jalankan build/lint untuk pastikan tidak ada error.

## 7. Larangan Eksplisit

- ❌ Mengubah schema tanpa file migration.
- ❌ Menghitung margin/total modal/total biaya di frontend saja tanpa validasi server.
- ❌ Membuat auto-blast WhatsApp/notifikasi otomatis ke customer tanpa persetujuan eksplisit (fitur reminder di fase awal bersifat manual/di-generate sebagai daftar, bukan auto-send).
- ❌ Menghapus/mengubah struktur tabel yang sudah dipakai fase sebelumnya tanpa mendiskusikan dampaknya ke fase lain.
- ❌ Menandai task selesai di `TODO.md` tanpa verifikasi sesuai § 5.
- ❌ Membuat endpoint/RPC yang menyentuh Finance atau data final (Sales/Servis closed) tanpa cek role eksplisit di server — termasuk lupa menerapkan `require_owner()` di aksi yang seharusnya Owner-only (lihat §11).

## 8. Ketika Ragu

Jika requirement tidak jelas atau ada konflik antara `PRD.md`/`FSD.md`/`SPEC.md`, **berhenti dan tanyakan**, jangan menebak dan lanjut coding — terutama untuk keputusan yang menyentuh skema data atau alur uang.

## 9. Mode Operasi: Minim Interaksi

Tujuan setup ini adalah long-running task dengan interupsi manusia seminimal mungkin. Aturan mainnya:

- **Checkpoint di `TODO.md` bukan berarti berhenti dan menunggu manusia.** Untuk task yang belum menghasilkan interface (mis. migration, trigger SQL, API route tanpa UI), agent **wajib verifikasi sendiri** terhadap `SPEC.md`/`FSD.md` (jalankan seed data, cek hasil kalkulasi, cek constraint) lalu **lanjut otomatis** ke task berikutnya tanpa menunggu approval, selama semua item Definition of Done (`SPEC.md` § 7) terpenuhi.
- **Manusia hanya direview ketika ada interface yang bisa dijalankan dan diklik** — halaman/form yang bisa dibuka di browser dan dites langsung. Sampai titik itu tercapai, agent terus jalan.
- Aturan di § 8 (berhenti kalau requirement ambigu/konflik) tetap berlaku — itu bukan soal kecepatan tapi soal keputusan yang tidak bisa ditebak sepihak (skema data, alur uang, business rule yang bertentangan).
- Kalau agent menemukan penyimpangan dari `SPEC.md` yang wajib diselesaikan tapi tidak kritikal terhadap arah proyek (mis. nama kolom kurang konsisten), catat di `HANDOFF.md` sebagai catatan, jangan berhenti untuk itu.

## 10. HANDOFF.md — Wajib Diperbarui Tiap Akhir Fase

Setiap kali sebuah fase di `TODO.md` selesai (semua task-nya `[x]`), agent **wajib membuat atau memperbarui** `HANDOFF.md` di root repo sebelum lanjut ke fase berikutnya. Ini bukan opsional — bagian dari Definition of Done tingkat fase.

Isi tiap entri fase di `HANDOFF.md`:
1. **Fase & tanggal selesai**
2. **Apa yang sudah dibangun** — ringkas per task, bukan diff kode mentah
3. **Keputusan teknis yang diambil** (dan alasannya, kalau ada penyimpangan dari `SPEC.md` awal — sertakan juga di sini)
4. **Cara menjalankan/menguji hasil fase ini** (perintah run, URL/route yang bisa dicek, akun test kalau perlu)
5. **Status interface**: apakah fase ini sudah menghasilkan UI yang bisa direview manusia, atau masih backend-only
6. **Yang belum selesai / diketahui rusak** (kalau ada)
7. **Rekomendasi fase berikutnya mulai dari mana**

`HANDOFF.md` ditulis untuk dua pembaca: manusia yang mau review cepat, dan sesi agent baru yang perlu tahu histori tanpa baca ulang seluruh git log. Tulis to-the-point, bukan naratif panjang.

## 11. Model Akses: Role Tetap, Bukan Permission Matrix

Sistem memakai 3 role tetap — `owner` > `admin` > `teknisi` — bukan permission matrix granular per pengguna (checkbox "boleh akses fitur X/Y/Z" per akun). Ini keputusan sadar, bukan keterbatasan sementara:

- Skala tim (1-2 admin, `BRD.md` §5) tidak membutuhkan nuansa permission per individu.
- Semua RLS yang sudah ada berpola role-based; permission matrix akan mengharuskan pembongkaran total ke model berbeda (tabel permission terpisah, UI assignment, dst.) — kompleksitas yang tidak proporsional untuk kebutuhan saat ini.
- Kebutuhan konkret (koreksi finance, retur unit terjual, manajemen akun) sepenuhnya terpenuhi lewat satu tingkat akses ekstra di atas Admin (`owner`), bukan kombinasi permission yang berbeda-beda per orang.

**Aturan wajib terkait role:**
- Setiap RPC/endpoint yang sensitif terhadap role (reversal finance, proses Retur, manajemen akun, `app_settings`) **wajib** memakai pola cek role terpusat (`require_owner()` di `SPEC.md` §3.5), bukan re-implementasi cek `if role === 'owner'` yang tersebar di banyak file — supaya kalau aturan role berubah, cukup ubah satu tempat.
- **Tidak boleh ada jalur di mana Admin bisa memicu aksi Owner-only secara tidak langsung** (mis. lewat endpoint lain yang lupa dicek rolenya, atau lewat client-side hide yang endpoint-nya tetap terbuka). Setiap fitur baru yang menyentuh Finance atau data yang sudah final (Sales/Servis yang closed) harus eksplisit ditentukan role-nya sebelum diimplementasikan — kalau ragu, ikuti §8 (berhenti dan tanyakan).
- Kalau di masa depan kebutuhan berubah (tim admin bertambah dengan tingkat kepercayaan berbeda), permission matrix opsional bisa ditambahkan **di atas** role ini (bukan menggantikannya) — jangan bongkar model role yang sudah ada tanpa diskusi eksplisit dengan Owner.
