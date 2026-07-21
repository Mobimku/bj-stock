import Link from "next/link";
import { z } from "zod";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const salesSchema = z.array(z.object({
  id_invoice: z.string(),
  id_customer: z.string().uuid().nullable(),
  channel: z.string(),
  tanggal_transaksi: z.string(),
  current_unit_id: z.string(),
  current_brand: z.string(),
  current_model: z.string().nullable(),
  current_transaction_value: z.union([z.number(), z.string()]),
  current_margin: z.union([z.number(), z.string()]),
}));
const customersSchema = z.array(z.object({ id_customer: z.string().uuid(), nama: z.string() }));

export default async function SalesPage() {
  const supabase = await createClient();
  const [{ data: authData }, salesResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("sales_current_state")
      .select("id_invoice, id_customer, channel, tanggal_transaksi, current_unit_id, current_brand, current_model, current_transaction_value, current_margin")
      .order("tanggal_transaksi", { ascending: false })
      .order("id_invoice", { ascending: false }),
  ]);
  const sales = salesSchema.safeParse(salesResult.data);
  const customerIds = sales.success
    ? [...new Set(sales.data.flatMap((sale) => sale.id_customer ? [sale.id_customer] : []))]
    : [];
  const customerResult = customerIds.length > 0
    ? await supabase.from("customers").select("id_customer, nama").in("id_customer", customerIds)
    : { data: [], error: null };
  const customers = customersSchema.safeParse(customerResult.data);
  const customerNames = customers.success
    ? new Map(customers.data.map((customer) => [customer.id_customer, customer.nama]))
    : new Map<string, string>();
  const admin = ["admin", "owner"].includes(authData.user?.app_metadata.role ?? "");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Sales</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Penjualan</h1>
          <p className="mt-2 text-stone-600">Invoice, harga jual, dan margin aktual per unit.</p>
        </div>
        {admin && <Link className="rounded-xl bg-stone-950 px-5 py-3 font-bold text-white hover:bg-amber-700" href="/scan?purpose=sale">Scan unit untuk dijual</Link>}
      </div>

      {(salesResult.error || customerResult.error || !sales.success || !customers.success) && <p className="mt-8 rounded-xl bg-red-50 p-4 text-red-700" role="alert">Data penjualan gagal dimuat.</p>}
      {sales.success && customers.success && sales.data.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">Belum ada transaksi penjualan.</div>}
      {sales.success && customers.success && sales.data.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {sales.data.map((sale) => (
            <Link className="grid gap-4 border-b border-stone-100 p-5 last:border-0 hover:bg-amber-50 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center" href={`/sales/${sale.id_invoice}`} key={sale.id_invoice}>
              <div>
                <p className="font-mono text-xs font-bold text-amber-700">{sale.id_invoice}</p>
                <p className="mt-1 font-black">{sale.current_brand} {sale.current_model}</p>
                <p className="mt-1 text-sm text-stone-500">{sale.id_customer ? customerNames.get(sale.id_customer) ?? "Customer tidak tercatat" : "Customer tidak tercatat"} · {sale.current_unit_id}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-400">Harga jual</p>
                <p className="mt-1 font-black">{formatCurrency(sale.current_transaction_value)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-400">Margin</p>
                <p className={`mt-1 font-black ${Number(sale.current_margin) < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(sale.current_margin)}</p>
              </div>
              <div className="text-sm text-stone-500 sm:text-right">
                <p>{sale.channel}</p>
                <p>{formatDate(sale.tanggal_transaksi)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
