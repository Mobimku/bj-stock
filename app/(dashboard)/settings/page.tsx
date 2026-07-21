import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-black text-[#172019]">Pengaturan</h1>
      <div className="mt-6 grid gap-4">
        <Link className="block rounded-2xl border border-stone-200 bg-white p-6 hover:border-amber-700 hover:shadow-md" href="/settings/accounts">
          <h2 className="text-lg font-black">Manajemen Akun</h2>
          <p className="mt-1 text-sm text-stone-600">Buat, nonaktifkan, atau aktifkan kembali akun Admin dan Teknisi.</p>
        </Link>
        <Link className="block rounded-2xl border border-stone-200 bg-white p-6 hover:border-amber-700 hover:shadow-md" href="/settings/app-settings">
          <h2 className="text-lg font-black">Pengaturan Aplikasi</h2>
          <p className="mt-1 text-sm text-stone-600">Ubah durasi garansi default dan ambang alert stok lama.</p>
        </Link>
      </div>
    </main>
  );
}
