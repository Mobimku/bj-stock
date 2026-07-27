import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime } from "@/lib/format";

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

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const role: string = authData.user?.app_metadata.role ?? "";
  if (!["admin", "owner"].includes(role)) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <p className="rounded-xl bg-amber-50 p-5 font-medium text-amber-900" role="alert">Halaman ini hanya untuk admin dan owner.</p>
      </main>
    );
  }

  const params = await searchParams;
  const filterParam = typeof params.status === "string" ? params.status : "";
  const filterStatus = z.enum(["Dipesan", "Selesai", "Dibatalkan", "Hangus"]).safeParse(filterParam).data ?? "";

  let query = supabase
    .from("reservations")
    .select("id_reservation, id_unit, dp_amount, agreed_price, is_refundable, expires_at, status, created_at, units!inner(brand, model), customers!inner(nama, kontak_wa)")
    .order("created_at", { ascending: false });
  if (filterStatus) query = query.eq("status", filterStatus);

  const { data, error } = await query;
  const reservations = z.array(reservationSchema).safeParse(data);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Data</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Reservasi (DP)</h1>

      <form className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-bold text-stone-700">
          Status
          <select className="mt-2 min-w-44 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20" name="status" defaultValue={filterStatus}>
            <option value="">Semua status</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button className="rounded-xl bg-[#198929] px-5 py-3 font-bold text-white hover:bg-[#147522]" type="submit">Tampilkan</button>
        {filterStatus && <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href="/reservations">Reset</Link>}
      </form>

      {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">Data reservasi gagal dimuat.</p>}

      {!error && (!reservations.success || reservations.data.length === 0) && (
        <p className="mt-6 rounded-xl bg-stone-50 p-5 text-stone-600">
          {filterStatus ? `Tidak ada reservasi berstatus ${filterStatus}.` : "Belum ada reservasi."}
        </p>
      )}

      {reservations.success && reservations.data.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wide text-stone-500">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">DP</th>
                  <th className="px-3 py-3">Harga</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Batas</th>
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
                    <td className="px-3 py-4 font-mono text-sm">{formatCurrency(r.agreed_price)}</td>
                    <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[r.status] ?? "bg-stone-100 text-stone-600"}`}>{r.status}</span></td>
                    <td className="px-3 py-4 text-sm text-stone-600">{formatDateTime(r.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-6 grid gap-3 md:hidden">
            {reservations.data.map((r) => (
              <Link className="rounded-2xl border border-stone-200 bg-white p-4 hover:border-amber-300" href={`/units/${r.id_unit}`} key={r.id_reservation}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-stone-400">{r.id_reservation.slice(0, 8)}</p>
                    <p className="mt-1 truncate font-bold text-stone-900">{r.units.brand} {r.units.model ?? ""}</p>
                    <p className="mt-0.5 text-sm text-stone-600">{r.customers.nama}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[r.status] ?? "bg-stone-100 text-stone-600"}`}>{r.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-stone-100 pt-3 text-center text-sm">
                  <div><p className="text-xs text-stone-500">DP</p><p className="font-bold">{formatCurrency(r.dp_amount)}</p></div>
                  <div><p className="text-xs text-stone-500">Harga</p><p className="font-bold">{formatCurrency(r.agreed_price)}</p></div>
                  <div><p className="text-xs text-stone-500">Batas</p><p className="text-xs font-bold">{formatDateTime(r.expires_at)}</p></div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
