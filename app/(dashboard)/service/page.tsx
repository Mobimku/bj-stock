
import Link from "next/link";
import { z } from "zod";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const statuses = ["Diterima", "Diagnosa", "Dikerjakan", "Selesai", "Diambil"] as const;
const filtersSchema = z.object({
  status: z.enum(statuses).optional().catch(undefined),
  type: z.enum(["Repair", "Install", "Cleaning"]).optional().catch(undefined),
});
const ordersSchema = z.array(z.object({
  id_servis: z.string(),
  jenis_servis: z.enum(["Repair", "Install", "Cleaning"]),
  brand_model: z.string(),
  status: z.enum(statuses),
  total_biaya: z.union([z.number(), z.string()]),
  tanggal_masuk: z.string(),
  estimasi_selesai: z.string().nullable(),
  customers: z.object({ nama: z.string() }),
}));

const statusStyle: Record<(typeof statuses)[number], string> = {
  Diterima: "bg-sky-100 text-sky-800",
  Diagnosa: "bg-[#ff751f]/15 text-[#a94300]",
  Dikerjakan: "bg-[#ff751f] text-white",
  Selesai: "bg-[#ffdc50] text-[#172019]",
  Diambil: "bg-[#198929] text-white",
};

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = filtersSchema.parse({
    status: typeof params.status === "string" ? params.status : undefined,
    type: typeof params.type === "string" ? params.type : undefined,
  });
  const supabase = await createClient();
  let query = supabase
    .from("service_orders")
    .select("id_servis, jenis_servis, brand_model, status, total_biaya, tanggal_masuk, estimasi_selesai, customers!inner(nama)")
    .order("tanggal_masuk", { ascending: false })
    .order("id_servis", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("jenis_servis", filters.type);
  const { data, error } = await query;
  const orders = ordersSchema.safeParse(data);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">Workshop</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Order servis</h1>
          <p className="mt-2 text-[#5e6b61]">Pantau penerimaan, pengerjaan, biaya, dan serah terima.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded-xl border border-[#198929] bg-white px-5 py-3 font-bold text-[#147522] hover:bg-[#198929]/10" href="/scan?purpose=service">Scan unit BJ</Link>
          <Link className="rounded-xl bg-[#198929] px-5 py-3 font-bold text-white hover:bg-[#147522]" href="/service/new">Terima servis luar</Link>
        </div>
      </div>

      <form className="mt-8 grid gap-3 rounded-2xl border border-[#dde5de] bg-white p-4 sm:grid-cols-[1fr_1fr_auto_auto]" method="get">
        <label className="text-xs font-bold uppercase tracking-wide text-[#5e6b61]">
          Status
          <select className="mt-1 block w-full rounded-lg border border-[#dde5de] px-3 py-2 text-sm font-normal text-[#172019]" name="status" defaultValue={filters.status ?? ""}>
            <option value="">Semua status</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-[#5e6b61]">
          Jenis
          <select className="mt-1 block w-full rounded-lg border border-[#dde5de] px-3 py-2 text-sm font-normal text-[#172019]" name="type" defaultValue={filters.type ?? ""}>
            <option value="">Semua jenis</option>
            <option>Repair</option>
            <option>Install</option>
            <option>Cleaning</option>
          </select>
        </label>
        <button className="self-end rounded-lg bg-[#198929] px-4 py-2 font-bold text-white" type="submit">Terapkan</button>
        <Link className="self-end rounded-lg px-4 py-2 text-center font-bold text-[#5e6b61] hover:bg-[#f7faf7]" href="/service">Reset</Link>
      </form>

      {(error || !orders.success) && <p className="mt-6 rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Data servis gagal dimuat.</p>}
      {orders.success && orders.data.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#dde5de] p-12 text-center text-[#5e6b61]">Belum ada order servis yang cocok.</div>}
      {orders.success && orders.data.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.data.map((order) => (
            <Link className="group rounded-2xl border border-[#dde5de] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#198929] hover:shadow-md" href={`/service/${order.id_servis}`} key={order.id_servis}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs font-bold text-[#198929]">{order.id_servis}</p>
                  <h2 className="mt-2 text-xl font-black group-hover:text-[#147522]">{order.brand_model}</h2>
                  <p className="mt-1 text-sm text-[#5e6b61]">{order.customers.nama} · {order.jenis_servis}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[order.status]}`}>{order.status}</span>
              </div>
              <div className="mt-8 flex items-end justify-between gap-4 border-t border-[#dde5de] pt-4">
                <div><p className="text-xs font-bold uppercase text-[#5e6b61]">Total biaya</p><p className="mt-1 font-black">{formatCurrency(order.total_biaya)}</p></div>
                <div className="text-right text-sm text-[#5e6b61]"><p>{formatDate(order.tanggal_masuk)}</p><p>{order.estimasi_selesai ? `Est. ${formatDate(order.estimasi_selesai)}` : "Tanpa estimasi"}</p></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
