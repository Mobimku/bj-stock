import { redirect } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInJakarta } from "@/lib/format";

const summarySchema = z.array(z.object({
  status: z.string(),
  jumlah: z.number(),
}));
const servicesSchema = z.array(z.object({
  id_servis: z.string(),
  brand_model: z.string(),
  status: z.string(),
  tanggal_masuk: z.string(),
  estimasi_selesai: z.string().nullable(),
  jenis_servis: z.string(),
}));
const warrantySchema = z.array(z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  tanggal_berakhir: z.string(),
  sisa_hari: z.number(),
}));

const STATUS_COLORS: Record<string, string> = {
  Masuk: "bg-slate-100 text-slate-700",
  QC: "bg-amber-100 text-amber-800",
  Ready: "bg-emerald-100 text-emerald-700",
  Listed: "bg-blue-100 text-blue-700",
  Terjual: "bg-violet-100 text-violet-700",
  Selesai: "bg-stone-100 text-stone-600",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.app_metadata.role !== "admin" && authData.user?.app_metadata.role !== "owner") redirect("/scan");

  const today = todayInJakarta();

  const [summaryResult, servicesResult, warrantyResult] = await Promise.all([
    supabase.rpc("get_dashboard_summary"),
    supabase.rpc("get_active_services"),
    supabase.rpc("get_warranty_expiring", { p_days: 7 }),
  ]);

  const summary = summarySchema.safeParse(summaryResult.data);
  const services = servicesSchema.safeParse(servicesResult.data);
  const warranties = warrantySchema.safeParse(warrantyResult.data);

  if (!summary.success || !services.success || !warranties.success) {
    return <main className="mx-auto max-w-5xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Data dashboard gagal dimuat.</p></main>;
  }

  const totalUnits = summary.data.reduce((sum, item) => sum + item.jumlah, 0);
  const activeCount = services.data.length;
  const warrantyCount = warranties.data.length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">Dashboard</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Ringkasan operasional</h1>
        <p className="mt-2 text-[#5e6b61]">Status stok, servis aktif, dan garansi yang akan habis.</p>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total unit" value={totalUnits} tone="green" />
        <Metric label="Servis aktif" value={activeCount} tone="dark" />
        <Metric label="Garansi akan habis" value={warrantyCount} tone={warrantyCount > 0 ? "red" : "dark"} />
        <Link href="/reports" className="flex min-w-0 items-center justify-center rounded-2xl bg-[#ff751f] p-4 text-white transition hover:bg-[#e6660f] sm:p-5">
          <span className="text-sm font-black uppercase">Lihat laporan →</span>
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-black">Unit per status</h2>
        {summary.data.length === 0 ? (
          <Empty text="Belum ada unit." />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {summary.data.map((item) => (
              <article className="rounded-2xl border border-[#dde5de] bg-white p-4" key={item.status}>
                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[item.status] ?? "bg-slate-100 text-slate-700"}`}>{item.status}</span>
                <p className="mt-3 text-3xl font-black">{item.jumlah}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Servis aktif</h2>
            <p className="mt-1 text-sm text-[#5e6b61]">{activeCount} order dalam proses</p>
          </div>
          <Link href="/service" className="text-sm font-bold text-[#198929] hover:underline">Semua servis →</Link>
        </div>
        {services.data.length === 0 ? (
          <Empty text="Tidak ada servis aktif." />
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#dde5de] bg-white">
            {services.data.map((item) => (
              <Link className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dde5de] p-4 last:border-0 hover:bg-[#f7faf7]" href={`/service/${item.id_servis}`} key={item.id_servis}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{item.status}</span>
                    <span className="font-mono text-xs font-bold text-[#198929]">{item.id_servis}</span>
                  </div>
                  <p className="mt-1 truncate font-black">{item.brand_model}</p>
                  <p className="mt-0.5 text-sm text-[#5e6b61]">{item.jenis_servis} · masuk {formatDate(item.tanggal_masuk)}{item.estimasi_selesai ? ` · estimasi {formatDate(item.estimasi_selesai)}` : ""}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Garansi akan habis</h2>
            <p className="mt-1 text-sm text-[#5e6b61]">Berakhir dalam 7 hari ({formatDate(today)})</p>
          </div>
          <Link href="/warranty" className="text-sm font-bold text-[#198929] hover:underline">Semua garansi →</Link>
        </div>
        {warranties.data.length === 0 ? (
          <Empty text="Tidak ada garansi yang akan habis dalam 7 hari." />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {warranties.data.map((item) => (
              <Link className="rounded-2xl border border-[#dde5de] bg-white p-5 hover:bg-[#f7faf7]" href={`/units/${item.id_unit}`} key={item.id_unit}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-[#198929]">{item.id_unit}</p>
                    <h3 className="mt-1 font-black">{item.brand}{item.model ? ` ${item.model}` : ""}</h3>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.sisa_hari <= 2 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{item.sisa_hari} hari lagi</span>
                </div>
                <p className="mt-3 text-sm text-[#5e6b61]">Berakhir {formatDate(item.tanggal_berakhir)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "dark" }: { label: string; value: number | string; tone?: "dark" | "green" | "red" }) {
  const color = tone === "green" ? "bg-[#198929] text-white" : tone === "red" ? "bg-[#c62828] text-white" : "bg-[#172019] text-white";
  return <article className={`min-w-0 rounded-2xl p-4 sm:p-5 ${color}`}><p className="text-xs font-bold uppercase text-white/65">{label}</p><p className="mt-3 break-words text-lg font-black sm:text-2xl">{value}</p></article>;
}

function Empty({ text }: { text: string }) {
  return <div className="mt-4 rounded-2xl border border-dashed border-[#dde5de] p-10 text-center text-[#5e6b61]">{text}</div>;
}
