import { redirect } from "next/navigation";
import { z } from "zod";
import { FinanceForms } from "./finance-forms";
import { formatCurrency, formatDate, todayInJakarta } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const accountsSchema = z.array(z.object({ id_account: z.string().uuid(), nama: z.string() }));
const cashFlowSchema = z.array(z.object({
  id_transaksi: z.string().uuid(),
  tanggal: z.string(),
  arah: z.enum(["Masuk", "Keluar"]),
  kategori: z.string(),
  akun: z.string(),
  jumlah: z.union([z.number(), z.string()]),
  catatan: z.string().nullable(),
  saldo: z.union([z.number(), z.string()]),
  is_reversal: z.boolean(),
  reversed: z.boolean(),
}));
const receivablesSchema = z.array(z.object({
  source_type: z.string(),
  source_id: z.string(),
  customer: z.string().nullable(),
  total_tagihan: z.union([z.number(), z.string()]),
  total_dibayar: z.union([z.number(), z.string()]),
  sisa_tagihan: z.union([z.number(), z.string()]),
  jatuh_tempo: z.string().nullable(),
  status: z.string(),
  umur_hari: z.number(),
}));
const profitLossSchema = z.array(z.object({
  pendapatan_sales: z.union([z.number(), z.string()]),
  pendapatan_servis: z.union([z.number(), z.string()]),
  retur: z.union([z.number(), z.string()]),
  hpp_unit: z.union([z.number(), z.string()]),
  biaya_part_servis: z.union([z.number(), z.string()]),
  operasional: z.union([z.number(), z.string()]),
  laba_bersih: z.union([z.number(), z.string()]),
}));

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = todayInJakarta();
  const start = parseDate(params.start, `${today.slice(0, 8)}01`);
  const end = parseDate(params.end, today);
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.app_metadata.role !== "admin" && authData.user?.app_metadata.role !== "owner") redirect("/scan");
  const isOwner = authData.user?.app_metadata.role === "owner";

  const [accountsResult, cashFlowResult, receivablesResult, profitLossResult] = await Promise.all([
    supabase.from("finance_accounts").select("id_account, nama").eq("is_active", true).order("nama"),
    supabase.rpc("get_cash_flow", { p_start_date: start, p_end_date: end }),
    supabase.rpc("get_receivables"),
    supabase.rpc("get_profit_loss", { p_start_date: start, p_end_date: end }),
  ]);
  const accounts = accountsSchema.safeParse(accountsResult.data);
  const cashFlow = cashFlowSchema.safeParse(cashFlowResult.data);
  const receivables = receivablesSchema.safeParse(receivablesResult.data);
  const profitLoss = profitLossSchema.safeParse(profitLossResult.data);

  if (accountsResult.error || cashFlowResult.error || receivablesResult.error || profitLossResult.error
    || !accounts.success || !cashFlow.success || !receivables.success || !profitLoss.success || !profitLoss.data[0]) {
    return <main className="mx-auto max-w-5xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Data Finance gagal dimuat.</p></main>;
  }

  const summary = profitLoss.data[0];
  const reversible = cashFlow.data.filter((item) => !item.is_reversal && !item.reversed);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">Finance</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Kas yang bisa ditelusuri</h1>
          <p className="mt-2 max-w-2xl text-[#5e6b61]">Jurnal otomatis, piutang, retur, dan laba-rugi dalam satu jejak transaksi.</p>
        </div>
        <form className="grid grid-cols-2 gap-3 rounded-2xl border border-[#dde5de] bg-white p-4" method="get">
          <DateFilter label="Dari" name="start" value={start} />
          <DateFilter label="Sampai" name="end" value={end} />
          <button className="col-span-2 rounded-xl bg-[#172019] px-5 py-3 font-bold text-white hover:bg-[#198929]" type="submit">Terapkan periode</button>
        </form>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Arus kas bersih" value={cashFlow.data[0]?.saldo ?? 0} tone="green" />
        <Metric label="Pendapatan Sales" value={summary.pendapatan_sales} />
        <Metric label="Pendapatan Servis" value={summary.pendapatan_servis} />
        <Metric label="Laba bersih" value={summary.laba_bersih} tone={Number(summary.laba_bersih) < 0 ? "red" : "green"} />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallMetric label="Retur" value={summary.retur} />
        <SmallMetric label="HPP unit" value={summary.hpp_unit} />
        <SmallMetric label="Part servis" value={summary.biaya_part_servis} />
        <SmallMetric label="Operasional" value={summary.operasional} />
      </section>

      <FinanceForms
        accounts={accounts.data.map((account) => ({ id: account.id_account, name: account.nama }))}
        transactions={reversible.map((item) => ({ id: item.id_transaksi, label: `${item.kategori} · ${formatCurrency(item.jumlah)} · ${formatDate(item.tanggal)}` }))}
        today={today}
        isOwner={isOwner}
      />

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">F-FIN-03</p><h2 className="mt-1 text-2xl font-black">Piutang</h2></div><span className="rounded-full bg-[#ffdc50] px-3 py-1 text-sm font-black">{receivables.data.filter((item) => item.status === "Belum Lunas").length} terbuka</span></div>
        {receivables.data.length === 0 ? <Empty text="Belum ada piutang." /> : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {receivables.data.map((item) => (
              <article className="rounded-2xl border border-[#dde5de] bg-white p-5" key={`${item.source_type}-${item.source_id}`}>
                <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[#198929]">{item.source_id}</p><h3 className="mt-1 font-black">{item.customer ?? item.source_type}</h3></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === "Lunas" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{item.status}</span></div>
                <p className="mt-5 text-xs font-bold uppercase text-[#5e6b61]">Sisa tagihan</p><p className="mt-1 text-2xl font-black">{formatCurrency(item.sisa_tagihan)}</p>
                <p className="mt-3 text-sm text-[#5e6b61]">Dibayar {formatCurrency(item.total_dibayar)} dari {formatCurrency(item.total_tagihan)}{item.umur_hari > 0 ? ` · lewat ${item.umur_hari} hari` : ""}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">F-FIN-01</p><h2 className="mt-1 text-2xl font-black">Arus kas</h2></div>
        {cashFlow.data.length === 0 ? <Empty text="Tidak ada transaksi pada periode ini." /> : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#dde5de] bg-white">
            {cashFlow.data.map((item) => (
              <article className="grid gap-3 border-b border-[#dde5de] p-5 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center" key={item.id_transaksi}>
                <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.arah === "Masuk" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{item.arah}</span><h3 className="font-black">{item.kategori}</h3>{item.is_reversal && <span className="text-xs font-bold text-[#ff751f]">REVERSAL</span>}</div><p className="mt-2 text-sm text-[#5e6b61]">{item.akun} · {formatDate(item.tanggal)}{item.catatan ? ` · ${item.catatan}` : ""}</p></div>
                <p className={`text-xl font-black sm:text-right ${item.arah === "Masuk" ? "text-emerald-700" : "text-red-700"}`}>{item.arah === "Masuk" ? "+" : "-"}{formatCurrency(item.jumlah)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function parseDate(value: string | string[] | undefined, fallback: string) {
  const parsed = z.iso.date().safeParse(typeof value === "string" ? value : "");
  return parsed.success ? parsed.data : fallback;
}

function DateFilter({ label, name, value }: { label: string; name: string; value: string }) {
  return <label className="text-xs font-bold uppercase text-[#5e6b61]">{label}<input className="mt-1 w-full rounded-xl border border-[#dde5de] px-3 py-2 text-base font-normal text-[#172019]" name={name} type="date" defaultValue={value} required /></label>;
}

function Metric({ label, value, tone = "dark" }: { label: string; value: number | string; tone?: "dark" | "green" | "red" }) {
  const color = tone === "green" ? "bg-[#198929] text-white" : tone === "red" ? "bg-[#c62828] text-white" : "bg-[#172019] text-white";
  return <article className={`min-w-0 rounded-2xl p-4 sm:p-5 ${color}`}><p className="text-xs font-bold uppercase text-white/65">{label}</p><p className="mt-3 break-words text-lg font-black sm:text-2xl">{formatCurrency(value)}</p></article>;
}

function SmallMetric({ label, value }: { label: string; value: number | string }) {
  return <article className="rounded-2xl border border-[#dde5de] bg-white p-4"><p className="text-xs font-bold uppercase text-[#5e6b61]">{label}</p><p className="mt-2 font-black">{formatCurrency(value)}</p></article>;
}

function Empty({ text }: { text: string }) {
  return <div className="mt-4 rounded-2xl border border-dashed border-[#dde5de] p-10 text-center text-[#5e6b61]">{text}</div>;
}
