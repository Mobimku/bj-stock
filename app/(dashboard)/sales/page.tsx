import Link from "next/link";
import { z } from "zod";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ReservationActions } from "@/components/sales/reservation-actions";

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

const reservationSchema = z.object({
  id_reservation: z.string().uuid(),
  id_unit: z.string(),
  dp_amount: z.union([z.number(), z.string()]),
  agreed_price: z.union([z.number(), z.string()]),
  is_refundable: z.boolean(),
  expires_at: z.string(),
  status: z.enum(["Dipesan", "Selesai", "Dibatalkan", "Hangus"]),
  created_at: z.string(),
  units: z.object({ brand: z.string(), model: z.string().nullable() }),
  customers: z.object({ nama: z.string(), kontak_wa: z.string().nullable() }),
});

const STATUS_OPTIONS = ["", "Dipesan", "Selesai", "Dibatalkan", "Hangus"] as const;
const STATUS_COLORS: Record<string, string> = {
  Dipesan: "bg-amber-100 text-amber-800",
  Selesai: "bg-emerald-100 text-emerald-700",
  Dibatalkan: "bg-red-100 text-red-700",
  Hangus: "bg-stone-100 text-stone-600",
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const view = params.view === "reservations" ? "reservations" : "penjualan";

  const { data: authData } = await supabase.auth.getUser();
  const admin = ["admin", "owner"].includes(authData.user?.app_metadata.role ?? "");
  const role: string = authData.user?.app_metadata.role ?? "";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Sales</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Penjualan</h1>
          <p className="mt-2 text-stone-600">Invoice, harga jual, margin aktual, dan reservasi DP.</p>
        </div>
        {admin && <Link className="rounded-xl bg-stone-950 px-5 py-3 font-bold text-white hover:bg-amber-700" href="/scan?purpose=sale">Scan unit untuk dijual</Link>}
      </div>

      <div className="mt-6 flex gap-1 rounded-xl bg-stone-100 p-1" role="tablist">
        <Link className={view === "penjualan" ? "flex-1 rounded-lg bg-white px-4 py-2.5 text-center text-sm font-bold text-stone-950 shadow-sm" : "flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-bold text-stone-600 transition hover:text-stone-950"} href="/sales" role="tab" aria-selected={view === "penjualan"}>Penjualan</Link>
        <Link className={view === "reservations" ? "flex-1 rounded-lg bg-white px-4 py-2.5 text-center text-sm font-bold text-stone-950 shadow-sm" : "flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-bold text-stone-600 transition hover:text-stone-950"} href="/sales?view=reservations" role="tab" aria-selected={view === "reservations"}>Reservasi</Link>
      </div>

      {view === "penjualan" ? <PenjualanView /> : <ReservasiView role={role} filterParam={typeof params.status === "string" ? params.status : ""} />}
    </main>
  );
}

async function PenjualanView() {
  const supabase = await createClient();
  const [salesResult] = await Promise.all([
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
    ? new Map(customers.data.map((c) => [c.id_customer, c.nama]))
    : new Map<string, string>();
  const loadError = salesResult.error || customerResult.error || !sales.success || !customers.success;

  if (loadError) return <p className="mt-8 rounded-xl bg-red-50 p-4 text-red-700" role="alert">Data penjualan gagal dimuat.</p>;
  if (sales.data.length === 0) return <div className="mt-8 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">Belum ada transaksi penjualan.</div>;

  return (
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
  );
}

async function ReservasiView({ role, filterParam }: { role: string; filterParam: string }) {
  const supabase = await createClient();
  const filterStatus = z.enum(["Dipesan", "Selesai", "Dibatalkan", "Hangus"]).safeParse(filterParam).data ?? "";

  let query = supabase
    .from("reservations")
    .select("id_reservation, id_unit, dp_amount, agreed_price, is_refundable, expires_at, status, created_at, units!inner(brand, model), customers!inner(nama, kontak_wa)")
    .order("created_at", { ascending: false });
  if (filterStatus) query = query.eq("status", filterStatus);

  const { data, error } = await query;
  const reservations = z.array(reservationSchema).safeParse(data);

  return (
    <>
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <input name="view" type="hidden" value="reservations" />
        <label className="text-sm font-bold text-stone-700">
          Status
          <select className="mt-2 min-w-44 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20" name="status" defaultValue={filterStatus}>
            <option value="">Semua status</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button className="rounded-xl bg-[#198929] px-5 py-3 font-bold text-white hover:bg-[#147522]" type="submit">Tampilkan</button>
        {filterStatus && <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href="/sales?view=reservations">Reset</Link>}
      </form>

      {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">Data reservasi gagal dimuat.</p>}

      {!error && (!reservations.success || reservations.data.length === 0) && (
        <p className="mt-6 rounded-xl bg-stone-50 p-5 text-stone-600">
          {filterStatus ? `Tidak ada reservasi berstatus ${filterStatus}.` : "Belum ada reservasi."}
        </p>
      )}

      {reservations.success && reservations.data.length > 0 && (
        <>
          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wide text-stone-500">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">DP</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {reservations.data.map((r) => (
                  <tr className="border-b border-stone-100 hover:bg-stone-50" key={r.id_reservation}>
                    <td className="px-3 py-4 font-mono text-sm font-bold">{r.id_reservation.slice(0, 8)}</td>
                    <td className="px-3 py-4">
                      <Link className="font-bold text-amber-700 hover:text-amber-900" href={`/units/${r.id_unit}`}>
                        {r.units.brand} {r.units.model ?? ""}
                      </Link>
                    </td>
                    <td className="px-3 py-4">
                      <p className="font-medium">{r.customers.nama}</p>
                      {r.customers.kontak_wa && <p className="text-xs text-stone-500">{r.customers.kontak_wa}</p>}
                    </td>
                    <td className="px-3 py-4 font-mono text-sm font-bold">{formatCurrency(r.dp_amount)}</td>
                    <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[r.status] ?? "bg-stone-100 text-stone-600"}`}>{r.status}</span></td>
                    <td className="px-3 py-4">
                      {r.status === "Dipesan" && (
                        <Link className="rounded-lg bg-[#198929] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#147522]" href={`/sales/new?reservation=${r.id_reservation}`}>Lanjutkan ke Sales</Link>
                      )}
                      {r.status === "Dipesan" && (
                        <div className="mt-1">
                          <ReservationActions reservationId={r.id_reservation} isRefundable={r.is_refundable} role={role} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-3 md:hidden">
            {reservations.data.map((r) => (
              <div className="rounded-2xl border border-stone-200 bg-white p-4" key={r.id_reservation}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-stone-400">{r.id_reservation.slice(0, 8)}</p>
                    <Link className="mt-1 block truncate font-bold text-stone-900 hover:text-amber-700" href={`/units/${r.id_unit}`}>
                      {r.units.brand} {r.units.model ?? ""}
                    </Link>
                    <p className="mt-0.5 text-sm text-stone-600">{r.customers.nama}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[r.status] ?? "bg-stone-100 text-stone-600"}`}>{r.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-stone-100 pt-3 text-center text-sm">
                  <div><p className="text-xs text-stone-500">DP</p><p className="font-bold">{formatCurrency(r.dp_amount)}</p></div>
                  <div><p className="text-xs text-stone-500">Harga</p><p className="font-bold">{formatCurrency(r.agreed_price)}</p></div>
                  <div><p className="text-xs text-stone-500">Batas</p><p className="text-xs font-bold">{formatDateTime(r.expires_at)}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  {r.status === "Dipesan" && (
                    <Link className="rounded-xl bg-[#198929] px-4 py-2 text-sm font-bold text-white hover:bg-[#147522]" href={`/sales/new?reservation=${r.id_reservation}`}>Lanjutkan ke Sales</Link>
                  )}
                  {r.status === "Dipesan" && <ReservationActions reservationId={r.id_reservation} isRefundable={r.is_refundable} role={role} />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
