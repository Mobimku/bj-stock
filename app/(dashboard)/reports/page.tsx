import { redirect } from "next/navigation";
import { z } from "zod";
import { todayInJakarta } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  marginSchema,
  turnoverSchema,
  leadSchema,
  catalogAnalyticsSchema,
} from "@/lib/report-contracts";
import {
  MarginSection,
  TurnoverSection,
  LeadsSection,
  CatalogSection,
  TopUnitsSection,
} from "./report-sections";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = todayInJakarta();
  const start = parseDate(params.start, `${today.slice(0, 8)}01`);
  const end = parseDate(params.end, today);
  if (start > end) {
    return <main className="mx-auto max-w-5xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Periode laporan tidak valid.</p></main>;
  }
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.app_metadata.role !== "admin" && authData.user?.app_metadata.role !== "owner") redirect("/scan");

  const [marginResult, turnoverResult, leadResult, analytics7Result, analytics30Result] = await Promise.all([
    supabase.rpc("get_margin_report", { p_start_date: start, p_end_date: end }),
    supabase.rpc("get_stock_turnover", { p_start_date: start, p_end_date: end }),
    supabase.rpc("get_lead_conversion", { p_start_date: start, p_end_date: end }),
    supabase.rpc("get_catalog_analytics", { p_days: 7 }),
    supabase.rpc("get_catalog_analytics", { p_days: 30 }),
  ]);
  const margin = marginSchema.safeParse(marginResult.data);
  const turnover = turnoverSchema.safeParse(turnoverResult.data);
  const leads = leadSchema.safeParse(leadResult.data);
  const analytics7 = catalogAnalyticsSchema.safeParse(analytics7Result.data);
  const analytics30 = catalogAnalyticsSchema.safeParse(analytics30Result.data);

  if (!margin.success || !turnover.success || !leads.success
    || !analytics7.success || !analytics30.success || !analytics7.data[0] || !analytics30.data[0]) {
    return <main className="mx-auto max-w-5xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Data laporan gagal dimuat.</p></main>;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">Laporan</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Data untuk keputusan bisnis</h1>
          <p className="mt-2 max-w-2xl text-[#5e6b61]">Margin per brand, kecepatan perputaran stock, dan efektivitas sumber lead.</p>
        </div>
        <form className="grid grid-cols-2 gap-3 rounded-2xl border border-[#dde5de] bg-white p-4" method="get">
          <DateFilter label="Dari" name="start" value={start} />
          <DateFilter label="Sampai" name="end" value={end} />
          <button className="col-span-2 rounded-xl bg-[#172019] px-5 py-3 font-bold text-white hover:bg-[#198929]" type="submit">Terapkan periode</button>
        </form>
      </header>

      <section className="mt-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">Katalog publik</p>
          <h2 className="mt-1 text-2xl font-black">Performa katalog</h2>
          <p className="mt-1 text-sm text-[#5e6b61]">Kunjungan staf yang sedang login tidak dihitung.</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <CatalogSection days={7} analytics={analytics7.data[0]} />
          <CatalogSection days={30} analytics={analytics30.data[0]} />
        </div>
        <div className="mt-6">
          <TopUnitsSection analytics={analytics30.data[0]} />
        </div>
      </section>

      <MarginSection data={margin.data} start={start} end={end} />
      <TurnoverSection data={turnover.data} start={start} end={end} />
      <LeadsSection data={leads.data} start={start} end={end} />
    </main>
  );
}

function parseDate(value: string | string[] | undefined, fallback: string) {
  const parsed = z.iso.date().safeParse(typeof value === "string" ? value : "");
  return parsed.success ? parsed.data : fallback;
}

function DateFilter({ label, name, value }: { label: string; name: string; value: string }) {
  return <label className="text-xs font-bold uppercase text-[#5e6b61]">{label}<input className="mt-1 w-full rounded-xl border border-[#dde5de] px-3 py-2 text-sm font-normal text-[#172019]" name={name} type="date" defaultValue={value} required /></label>;
}


