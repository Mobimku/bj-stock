import { z } from "zod";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { bankPartSchema } from "@/lib/validation/bank-stock";
import { PartForm } from "./part-form";

export default async function BankStockPage() {
  const supabase = await createClient();
  const [{ data, error }, authResult] = await Promise.all([
    supabase.from("bank_stock").select("*").order("jenis_part"),
    supabase.auth.getUser(),
  ]);
  const parts = z.array(bankPartSchema).safeParse(data);
  const isAdmin = ["admin", "owner"].includes(authResult.data.user?.app_metadata.role ?? "");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Spare part bersama</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Bank Stock</h1>
        <p className="mt-2 text-stone-600">Satu sumber stok untuk upgrade unit dan pekerjaan servis.</p>
      </div>

      {isAdmin && (
        <details className="mt-8 rounded-2xl border border-stone-200 bg-white p-5" open={!parts.success || parts.data.length === 0}>
          <summary className="cursor-pointer font-black">Tambah part baru</summary>
          <div className="mt-5 border-t border-stone-100 pt-5">
            <PartForm />
          </div>
        </details>
      )}

      {(error || !parts.success) && (
        <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700" role="alert">Bank Stock gagal dimuat.</p>
      )}
      {parts.success && parts.data.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">Belum ada part.</div>
      )}
      {parts.success && parts.data.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {parts.data.map((part) => (
            <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" key={part.id_part}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs font-bold text-stone-500">{part.id_part}</p>
                  <h2 className="mt-2 text-xl font-black">{part.jenis_part}</h2>
                  <p className="mt-1 text-sm text-stone-500">{part.kondisi} · {part.sumber ?? "Sumber tidak dicatat"}</p>
                </div>
                <div className={`rounded-xl px-3 py-2 text-center ${part.stock_qty === 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                  <p className="text-2xl font-black">{part.stock_qty}</p>
                  <p className="text-[10px] font-bold uppercase">stok</p>
                </div>
              </div>
              <p className="mt-6 border-t border-stone-100 pt-4 font-black">{formatCurrency(part.modal_per_unit)} / unit</p>
              {isAdmin && (
                <details className="mt-4 border-t border-stone-100 pt-4">
                  <summary className="cursor-pointer text-sm font-bold text-amber-700">Ubah data / restock</summary>
                  <div className="mt-4">
                    <PartForm part={part} />
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
