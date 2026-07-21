import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UnitForm } from "./unit-form";

export default async function NewUnitPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user?.app_metadata.role !== "admin" && data.user?.app_metadata.role !== "owner") redirect("/units");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href="/units">
        Kembali ke daftar
      </Link>
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Stock masuk</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Tambah unit baru</h1>
        <p className="mb-8 mt-2 text-stone-600">ID dan QR dibuat otomatis setelah data tersimpan.</p>
        <UnitForm defaultDate={new Date().toISOString().slice(0, 10)} />
      </div>
    </main>
  );
}
