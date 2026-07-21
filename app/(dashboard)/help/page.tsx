import Link from "next/link";

const ADMIN_GUIDES: { title: string; steps: string[] }[] = [
  {
    title: "Tambah unit baru",
    steps: [
      "Buka menu Unit → tombol Tambah Unit.",
      "Isi brand, model, serial number, spek, kondisi, sumber beli, dan modal awal (harga beli).",
      "Simpan. Sistem membuat ID unit otomatis, QR code, dan mencatat kas keluar di Finance.",
      "Status unit awal: Masuk. Lanjut ke QC → Ready → Listed lewat halaman detail unit.",
    ],
  },
  {
    title: "Transaksi penjualan (Sales)",
    steps: [
      "Buka menu Sales → tombol Jual Unit, atau scan QR unit dari halaman Scan.",
      "Pilih unit (status harus Ready atau Listed), isi data customer (otomatis dibuat jika baru), harga jual, channel, metode bayar.",
      "Untuk Cicilan: sistem membuat piutang. Pembayaran cicilan dicatat lewat menu Finance → form Pembayaran Cicilan.",
      "Konfirmasi. Sistem otomatis: ubah status unit ke Terjual, buat garansi, catat kas masuk/piutang di Finance.",
    ],
  },
  {
    title: "Servis laptop",
    steps: [
      "Buka menu Servis → tombol Servis Baru.",
      "Pilih jenis servis (Repair/Install/Cleaning), isi brand-model, keluhan.",
      "Customer bisa dipilih dari yang sudah ada atau isi data baru (nama + WA).",
      "Update status servis: Diterima → Diagnosa → Dikerjakan → Selesai → Diambil.",
      "Pembayaran servis dicatat lewat menu Finance → form Pembayaran Servis (saat uang diterima, bukan saat status berubah).",
      "Customer bisa cek status servis lewat link publik /s/[id_servis] atau scan QR servis.",
    ],
  },
  {
    title: "Upgrade unit (tambah part)",
    steps: [
      "Buka detail unit yang mau di-upgrade.",
      "Pilih part dari Bank Stock (stok part bersama).",
      "Isi biaya (otomatis dari modal part, bisa diubah).",
      "Simpan. Sistem mengurangi stok part dan menambah total modal unit otomatis.",
      "Jika biaya upgrade dari jasa luar (tanpa part), isi biaya saja — sistem mencatat kas keluar di Finance.",
    ],
  },
  {
    title: "Finance & Retur",
    steps: [
      "Menu Finance menampilkan arus kas, piutang, dan laba rugi.",
      "Form tersedia: Biaya Operasional, Modal Disetor, Pembayaran Cicilan, Pembayaran Servis, Reversal (pembatalan), Retur.",
      "Retur Unit: otomatis kembalikan unit ke Ready, tutup garansi, catat kas keluar (refund).",
      "Retur Servis: catat refund, tidak menghapus order servis asli.",
      "Transaksi finance tidak bisa diedit/dihapus. Koreksi lewat Reversal.",
    ],
  },
  {
    title: "Dashboard & Laporan",
    steps: [
      "Menu Dashboard: ringkasan unit per status, servis aktif, garansi akan habis (7 hari).",
      "Menu Laporan: margin per brand, kecepatan perputaran stock, sumber lead vs konversi.",
      "Gunakan filter periode (dari-sampai tanggal) untuk laporan.",
      "Menu Export: unduh data setiap tabel dalam format CSV untuk backup.",
    ],
  },
];

const TEKNISI_GUIDES: { title: string; steps: string[] }[] = [
  {
    title: "Scan QR unit/servis",
    steps: [
      "Buka menu Scan (tombol kamera di bottom bar mobile).",
      "Izinkan akses kamera, arahkan ke QR code pada unit atau order servis.",
      "Sistem langsung membuka halaman detail unit/servis.",
    ],
  },
  {
    title: "Update status servis",
    steps: [
      "Buka detail servis (via scan QR atau menu Servis).",
      "Ubah status: Diterima → Diagnosa → Dikerjakan → Selesai.",
      "Isi diagnosa dan tindakan saat tersedia.",
      "Status Diambil hanya bisa di-set oleh admin (saat customer mengambil unit).",
    ],
  },
  {
    title: "Lihat detail unit",
    steps: [
      "Buka menu Unit untuk daftar semua unit, atau scan QR unit.",
      "Filter berdasarkan brand atau status.",
      "Halaman detail menampilkan spek, foto, riwayat upgrade, dan QR code.",
      "Teknisi tidak bisa mengubah status unit, hanya admin.",
    ],
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">Panduan</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Cara pakai BJ Stock</h1>
        <p className="mt-2 text-[#5e6b61]">Panduan singkat operasional untuk admin dan teknisi.</p>
      </header>

      <section className="mt-10">
        <h2 className="flex items-center gap-3 text-xl font-black">
          <span className="rounded-xl bg-[#198929] px-3 py-1 text-sm text-white">ADMIN</span>
          Panduan operasional admin
        </h2>
        <div className="mt-5 space-y-6">
          {ADMIN_GUIDES.map((guide) => (
            <article key={guide.title} className="rounded-2xl border border-[#dde5de] bg-white p-5">
              <h3 className="font-black text-[#172019]">{guide.title}</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#5e6b61]">
                {guide.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="flex items-center gap-3 text-xl font-black">
          <span className="rounded-xl bg-[#ff751f] px-3 py-1 text-sm text-white">TEKNISI</span>
          Panduan operasional teknisi
        </h2>
        <div className="mt-5 space-y-6">
          {TEKNISI_GUIDES.map((guide) => (
            <article key={guide.title} className="rounded-2xl border border-[#dde5de] bg-white p-5">
              <h3 className="font-black text-[#172019]">{guide.title}</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#5e6b61]">
                {guide.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-2xl bg-[#172019] p-6 text-white">
        <h2 className="text-lg font-black">Aturan penting</h2>
        <ul className="mt-4 space-y-2 text-sm text-white/80">
          <li>• Semua perhitungan uang (modal, margin, biaya) dilakukan sistem, bukan input manual.</li>
          <li>• Transaksi finance tidak bisa diedit atau dihapus. Koreksi lewat Reversal.</li>
          <li>• Status unit Terjual hanya terjadi lewat alur Sales, tidak ada tombol manual.</li>
          <li>• Pemakaian part dari Bank Stock otomatis mengurangi stok dan menambah modal unit.</li>
          <li>• Teknisi tidak bisa akses Finance, Customer, Dashboard, dan Laporan.</li>
          <li>• Scan QR butuh kamera HP/komputer. Pastikan izinkan akses kamera di browser.</li>
        </ul>
      </section>

      <p className="mt-10 text-center text-sm text-[#5e6b61]">
        Butuh bantuan lebih? Hubungi developer. Kembali ke{" "}
        <Link className="font-bold text-[#198929] hover:underline" href="/dashboard">Dashboard</Link>
      </p>
    </main>
  );
}
