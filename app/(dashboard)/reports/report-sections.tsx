import { formatCurrency, formatDate } from "@/lib/format";
import type {
  MarginReportRow,
  TurnoverReportRow,
  LeadReportRow,
  CatalogAnalytics,
} from "@/lib/report-contracts";

function formatNumber(value: number, maxDigits = 0) {
  return value.toLocaleString("id-ID", { maximumFractionDigits: maxDigits });
}

function Empty({ text }: { text: string }) {
  return <div className="mt-4 rounded-2xl border border-dashed border-[#dde5de] p-10 text-center text-[#5e6b61]">{text}</div>;
}

function CsvLink({ href, label = "CSV" }: { href: string; label?: string }) {
  return (
    <a href={href} className="inline-flex min-h-[2.75rem] items-center justify-center whitespace-nowrap rounded-lg border border-[#dde5de] px-4 text-xs font-bold text-[#5e6b61] hover:border-[#198929] hover:text-[#198929]" download>
      {label}
    </a>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f7faf7] p-3"><p className="text-xs font-bold uppercase text-[#5e6b61]">{label}</p><p className="mt-2 break-words text-xl font-black tabular-nums sm:text-2xl">{value}</p></div>;
}

function renderHari(v: number | null): string {
  switch (v) { case null: return "—"; default: return v.toFixed(0) + " hari"; }
}

export function MarginSection({ data, start, end }: { data: readonly MarginReportRow[]; start: string; end: string }) {
  return (
    <section className="mt-10">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="grow">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">Margin</p>
          <h2 className="mt-1 text-2xl font-black">Margin per brand</h2>
          <p className="mt-1 text-sm text-[#5e6b61]">Periode {formatDate(start)} — {formatDate(end)}</p>
        </div>
        <CsvLink href={`/api/reports/export?dataset=margin&start=${start}&end=${end}`} label="Spreadsheet (CSV)" />
      </div>
      {data.length === 0 ? <Empty text="Belum ada penjualan pada periode ini." /> : (
        <><div className="mt-4 grid gap-3 md:hidden">
            {data.map((row) => (
              <article key={row.brand} className="rounded-xl border border-[#dde5de] bg-white p-4">
                <dl className="grid grid-cols-2 gap-y-3">
                  <div className="col-span-2"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Brand</dt><dd className="mt-0.5 font-black">{row.brand}</dd></div>
                  <div><dt className="text-xs font-bold uppercase text-[#5e6b61]">Unit terjual</dt><dd className="mt-0.5 tabular-nums">{row.unit_terjual}</dd></div>
                  <div className="text-right"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Revenue</dt><dd className="mt-0.5 tabular-nums font-bold text-[#198929]">{formatCurrency(row.total_revenue)}</dd></div>
                  <div><dt className="text-xs font-bold uppercase text-[#5e6b61]">Margin</dt><dd className="mt-0.5 tabular-nums font-bold text-[#198929]">{formatCurrency(row.total_margin)}</dd></div>
                  <div className="text-right"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Rata-rata</dt><dd className="mt-0.5 tabular-nums">{formatCurrency(row.margin_rata_rata)}</dd></div>
                </dl>
              </article>
            ))}
          </div><div className="hidden md:block"><div className="mt-4 overflow-x-auto rounded-2xl border border-[#dde5de] bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[#dde5de] bg-[#f7faf7] text-left text-xs font-bold uppercase text-[#5e6b61]">
                <tr><th className="px-5 py-3">Brand</th><th className="px-5 py-3 text-right">Unit terjual</th><th className="px-5 py-3 text-right">Revenue</th><th className="px-5 py-3 text-right">Margin</th><th className="px-5 py-3 text-right">Margin rata-rata</th></tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr className="border-b border-[#dde5de] last:border-0" key={row.brand}>
                    <td className="px-5 py-3 font-black">{row.brand}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.unit_terjual}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(row.total_revenue)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-[#198929]">{formatCurrency(row.total_margin)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(row.margin_rata_rata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div></>
      )}
    </section>
  );
}

export function TurnoverSection({ data, start, end }: { data: readonly TurnoverReportRow[]; start: string; end: string }) {
  return (
    <section className="mt-10">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="grow">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">Perputaran stock</p>
          <h2 className="mt-1 text-2xl font-black">Kecepatan unit terjual</h2>
          <p className="mt-1 text-sm text-[#5e6b61]">Rata-rata hari dari tanggal masuk sampai terjual, per brand.</p>
        </div>
        <CsvLink href={`/api/reports/export?dataset=turnover&start=${start}&end=${end}`} label="Spreadsheet (CSV)" />
      </div>
      {data.length === 0 ? <Empty text="Belum ada unit yang terjual." /> : (
        <><div className="mt-4 grid gap-3 md:hidden">
            {data.map((row) => (
              <article key={row.brand} className="rounded-xl border border-[#dde5de] bg-white p-4">
                <dl className="grid grid-cols-2 gap-y-3">
                  <div className="col-span-2"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Brand</dt><dd className="mt-0.5 font-black">{row.brand}</dd></div>
                  <div><dt className="text-xs font-bold uppercase text-[#5e6b61]">Unit terjual</dt><dd className="mt-0.5 tabular-nums">{row.unit_terjual}</dd></div>
                  <div className="text-right"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Rata-rata hari</dt><dd className="mt-0.5 tabular-nums font-bold">{row.rata_rata_hari === null ? "—" : `${row.rata_rata_hari.toFixed(0)} hari`}</dd></div>
                </dl>
              </article>
            ))}
          </div><div className="mt-4 hidden overflow-x-auto rounded-2xl border border-[#dde5de] bg-white md:block">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-[#dde5de] bg-[#f7faf7] text-left text-xs font-bold uppercase text-[#5e6b61]">
                <tr><th className="px-5 py-3">Brand</th><th className="px-5 py-3 text-right">Unit terjual</th><th className="px-5 py-3 text-right">Rata-rata hari</th></tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr className="border-b border-[#dde5de] last:border-0" key={row.brand}>
                    <td className="px-5 py-3 font-black">{row.brand}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.unit_terjual}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold">{renderHari(row.rata_rata_hari)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></>
      )}
    </section>
  );
}

export function LeadsSection({ data, start, end }: { data: readonly LeadReportRow[]; start: string; end: string }) {
  return (
    <section className="mt-10">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="grow">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">Sumber lead</p>
          <h2 className="mt-1 text-2xl font-black">Distribusi & konversi lead</h2>
          <p className="mt-1 text-sm text-[#5e6b61]">Periode {formatDate(start)} — {formatDate(end)}</p>
        </div>
        <CsvLink href={`/api/reports/export?dataset=leads&start=${start}&end=${end}`} label="Spreadsheet (CSV)" />
      </div>
      {data.length === 0 ? <Empty text="Belum ada customer tercatat." /> : (
        <><div className="mt-4 grid gap-3 md:hidden">
            {data.map((row, idx) => (
              <article key={row.sumber_lead ?? `empty-${idx}`} className="rounded-xl border border-[#dde5de] bg-white p-4">
                <dl className="grid grid-cols-2 gap-y-3">
                  <div className="col-span-2"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Sumber lead</dt><dd className="mt-0.5 font-black">{row.sumber_lead ?? "—"}</dd></div>
                  <div><dt className="text-xs font-bold uppercase text-[#5e6b61]">Customer</dt><dd className="mt-0.5 tabular-nums">{row.jumlah_customer}</dd></div>
                  <div className="text-right"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Konversi sales</dt><dd className="mt-0.5 tabular-nums">{row.konversi_sales}</dd></div>
                  <div><dt className="text-xs font-bold uppercase text-[#5e6b61]">Konversi servis</dt><dd className="mt-0.5 tabular-nums">{row.konversi_servis}</dd></div>
                  <div className="text-right"><dt className="text-xs font-bold uppercase text-[#5e6b61]">Total revenue</dt><dd className="mt-0.5 tabular-nums font-bold text-[#198929]">{formatCurrency(row.total_revenue)}</dd></div>
                </dl>
              </article>
            ))}
          </div><div className="mt-4 hidden overflow-x-auto rounded-2xl border border-[#dde5de] bg-white md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[#dde5de] bg-[#f7faf7] text-left text-xs font-bold uppercase text-[#5e6b61]">
                <tr><th className="px-5 py-3">Sumber lead</th><th className="px-5 py-3 text-right">Customer</th><th className="px-5 py-3 text-right">Konversi sales</th><th className="px-5 py-3 text-right">Konversi servis</th><th className="px-5 py-3 text-right">Total revenue</th></tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr className="border-b border-[#dde5de] last:border-0" key={row.sumber_lead ?? `empty-${idx}`}>
                    <td className="px-5 py-3 font-black">{row.sumber_lead ?? "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.jumlah_customer}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.konversi_sales}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{row.konversi_servis}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-[#198929]">{formatCurrency(row.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></>
      )}
    </section>
  );
}

export function CatalogSection({ days, analytics }: { days: 7 | 30; analytics: CatalogAnalytics }) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#dde5de] bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-[#198929]">{days} hari terakhir</p>
        <div className="flex flex-wrap gap-1.5">
          <CsvLink href={`/api/reports/export?dataset=catalog-summary&days=${days}`} label="Ringkasan CSV" />
          <CsvLink href={`/api/reports/export?dataset=catalog-top-units&days=${days}`} label="Unit CSV" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Pengunjung unik" value={formatNumber(analytics.unique_visitors)} />
        <Metric label="Detail dilihat" value={formatNumber(analytics.detail_views)} />
        <Metric label="Klik WhatsApp" value={formatNumber(analytics.whatsapp_clicks)} />
        <Metric label="Klik Bagikan" value={formatNumber(analytics.share_clicks)} />
        <div className="col-span-2"><Metric label="Detail → WhatsApp" value={`${formatNumber(analytics.conversion_rate, 1)}%`} /></div>
      </div>
    </article>
  );
}

export function TopUnitsSection({ analytics }: { analytics: CatalogAnalytics }) {
  return (
    <><div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <h3 className="text-lg font-black">Unit paling banyak dilihat · 30 hari</h3>
        <CsvLink href="/api/reports/export?dataset=catalog-top-units&days=30" label="CSV" />
      </div>
      {analytics.top_units.length === 0 ? <Empty text="Belum ada unit yang dilihat dalam 30 hari terakhir." /> : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {analytics.top_units.map((unit) => (
            <article className="min-w-0 rounded-2xl border border-[#dde5de] bg-white p-4" key={unit.id_unit}>
              <p className="break-all font-mono text-xs font-bold text-[#198929]">{unit.id_unit}</p>
              <p className="mt-2 break-words font-black">{unit.brand}{unit.model ? ` ${unit.model}` : ""}</p>
              <p className="mt-4 text-sm text-[#5e6b61]"><span className="text-xl font-black tabular-nums text-[#172019]">{formatNumber(unit.detail_views)}</span> tampilan</p>
            </article>
          ))}
        </div>
      )}</>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  direct: "Langsung / unknown",
  unknown: "Tidak diketahui",
  google: "Google",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  x: "X / Twitter",
  shopee: "Shopee",
  tokopedia: "Tokopedia",
  lazada: "Lazada",
  telegram: "Telegram",
  bing: "Bing",
};

function sourceLabel(source: string) {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  if (source.startsWith("utm:")) return `Kampanye (${source.slice(4)})`;
  return source;
}

export function TopSourcesSection({ analytics }: { analytics: CatalogAnalytics }) {
  const sources = analytics.top_sources ?? [];
  return (
    <>
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <div>
          <h3 className="text-lg font-black">Sumber trafik · 30 hari</h3>
          <p className="mt-1 text-sm text-[#5e6b61]">
            Dari UTM link / referrer (bukan URL mentah). Optimasi channel yang bawa pengunjung & WA.
          </p>
        </div>
        <CsvLink href="/api/reports/export?dataset=catalog-top-sources&days=30" label="CSV" />
      </div>
      {sources.length === 0 ? (
        <Empty text="Belum ada data sumber trafik. Bagikan link katalog dengan ?utm_source=instagram dsb." />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-[#dde5de] bg-white">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-[#dde5de] bg-[#f7faf7] text-xs font-bold uppercase text-[#5e6b61]">
              <tr>
                <th className="px-4 py-3">Sumber</th>
                <th className="px-4 py-3 text-right">Pengunjung</th>
                <th className="px-4 py-3 text-right">Detail</th>
                <th className="px-4 py-3 text-right">Klik WA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dde5de]">
              {sources.map((row) => (
                <tr key={row.source} className="hover:bg-[#f7faf7]">
                  <td className="px-4 py-3 font-bold text-[#172019]">{sourceLabel(row.source)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-black">{formatNumber(row.visitors)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.detail_views)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.whatsapp_clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
