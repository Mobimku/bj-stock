import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import logoBlack from "@/assets/logo-transparent.svg";
import { CancelSaleButton } from "@/components/sales/cancel-sale-button";
import { formatCurrency, formatDate, todayInJakarta } from "@/lib/format";
import { PrintButton } from "./print-button";
import { ReplacementAction } from "./replacement-action";
import { loadSaleDetail } from "./sale-detail-data";
import { SaleTestSummary } from "./sale-test-summary";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadSaleDetail(id.toUpperCase());
  if (result.kind === "not_found") notFound();
  if (result.kind === "error") return <LoadError />;

  const today = todayInJakarta();
  const replacementContext = result.role === "owner"
    && result.state?.current_warranty_status === "Aktif"
    && result.state.current_warranty_start
    && result.state.current_warranty_end
    && result.state.current_warranty_start <= today
    && result.state.current_warranty_end >= today
    && result.currentUnit
    ? {
        warrantyStart: result.state.current_warranty_start,
        warrantyEnd: result.state.current_warranty_end,
      }
    : null;

  return (
    <main className="invoice-print-page mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:bg-white print:p-0">
      <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-4 print:hidden">
        <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href="/sales">Kembali ke penjualan</Link>
        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          {result.role === "owner" && result.state?.replacement_count === 0 && <CancelSaleButton idInvoice={result.sale.id_invoice} />}
          <PrintButton />
        </div>
      </div>

      {result.state && result.currentUnit ? <section className="mx-auto mb-6 max-w-3xl rounded-2xl border border-[var(--border)] bg-white p-5 print:hidden sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-primary)]">Unit diterima customer saat ini</p>
            <h1 className="mt-2 text-2xl font-black">{result.currentUnit.brand} {result.currentUnit.model}</h1>
            <p className="mt-1 break-all font-mono text-sm font-bold text-[var(--text-secondary)]">{result.currentUnit.id_unit}</p>
          </div>
          <span className="rounded-full bg-[var(--brand-accent)] px-3 py-1 text-sm font-black">{result.state.replacement_count}× penggantian</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <CurrentMetric label="Nilai saat ini" value={formatCurrency(result.state.current_transaction_value)} />
          <CurrentMetric label="Serial" value={result.currentUnit.serial_number ?? "-"} />
          <CurrentMetric label="Garansi saat ini" value={result.state.current_warranty_end ? `${result.state.current_warranty_status} · ${formatDate(result.state.current_warranty_end)}` : "Tidak tersedia"} />
        </div>
        {replacementContext && (
          <div className="mt-5 border-t border-[var(--border)] pt-5 sm:text-right">
            <ReplacementAction
              idInvoice={result.sale.id_invoice}
              currentUnitId={result.state.current_unit_id}
              currentValue={result.state.current_transaction_value}
              currentWarrantyStart={replacementContext.warrantyStart}
              currentWarrantyEnd={replacementContext.warrantyEnd}
              defaultDate={today}
              claims={result.claims}
              candidates={result.candidates}
              accounts={result.accounts}
            />
          </div>
        )}
      </section> : (
        <p className="mx-auto mb-6 max-w-3xl rounded-xl bg-stone-100 p-4 text-sm text-stone-600 print:hidden">Invoice ini tidak memiliki unit aktif saat ini karena transaksi sudah dibatalkan atau diretur.</p>
      )}

      <div className="invoice-print-root grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)] xl:items-start">
        <div className="invoice-print-left mx-auto w-full max-w-3xl xl:max-w-none">
          <article className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-10 print:border print:border-stone-950 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-4 border-stone-950 pb-7 print:gap-3 print:pb-2">
          <div>
            <Image className="h-16 w-auto object-contain print:h-11" src={logoBlack} alt="BJ Laptop" priority />
            <p className="mt-2 text-sm text-stone-500 print:mt-1 print:text-[8pt]">BJ Laptop · Bangunjiwo</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-500 print:text-[7pt]">Invoice asli</p>
            <h2 className="mt-1 break-all font-mono text-xl font-black print:mt-0.5 print:text-[12pt]">{result.sale.id_invoice}</h2>
            <p className="mt-1 text-sm text-stone-500 print:text-[8pt]">{formatDate(result.sale.tanggal_transaksi)}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-stone-200 py-7 sm:grid-cols-2 print:gap-2 print:py-2.5">
          <div>
            <p className="text-xs font-bold uppercase text-stone-400 print:text-[7pt]">Customer</p>
            {result.sale.id_customer && result.customer ? (
              <>
                <Link className="mt-2 block text-lg font-black text-[var(--brand-primary)] underline print:mt-0.5 print:text-[11pt] print:text-black print:no-underline" href={`/customers/${result.sale.id_customer}`}>{result.customer.nama}</Link>
                <p className="text-stone-600 print:text-[8pt]">{result.customer.kontak_wa ?? "Kontak tidak dicatat"}</p>
              </>
            ) : <p className="mt-2 text-lg font-black print:text-[11pt]">Customer tidak tercatat</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-bold uppercase text-stone-400 print:text-[7pt]">Pembayaran</p>
            <p className="mt-2 font-black print:mt-0.5 print:text-[10pt]">{result.sale.metode_bayar}</p>
            <p className="text-stone-600 print:text-[8pt]">{result.sale.channel}</p>
          </div>
        </section>

        <section className="py-7 print:py-2.5">
          <div className="flex items-start justify-between gap-6 print:gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs font-bold text-stone-500 print:text-[7pt]">Unit invoice asli · {result.sale.id_unit}</p>
              <h2 className="mt-2 text-2xl font-black print:mt-0.5 print:text-[13pt]">{result.originalUnit.brand} {result.originalUnit.model}</h2>
              <p className="mt-1 text-sm text-stone-500 print:text-[8pt]">Serial: {result.originalUnit.serial_number ?? "-"}</p>
            </div>
            <p className="shrink-0 text-xl font-black print:text-[12pt]">{formatCurrency(result.sale.harga_jual)}</p>
          </div>
          <div className="mt-8 flex items-center justify-between border-t-2 border-stone-950 pt-4 print:mt-2.5 print:pt-1.5">
            <p className="font-black print:text-[10pt]">TOTAL ASLI</p>
            <p className="text-2xl font-black print:text-[14pt]">{formatCurrency(result.sale.harga_jual)}</p>
          </div>
        </section>

        <footer className="rounded-xl bg-stone-100 p-5 text-sm text-stone-700 print:mt-auto print:rounded-none print:bg-stone-100 print:p-2 print:text-[8pt]">
          <p className="font-bold">Garansi awal unit berlaku sampai {formatDate(result.originalWarranty.tanggal_berakhir)}.</p>
          <p className="mt-1">Invoice ini adalah snapshot transaksi asli. Bukti penggantian dicetak terpisah.</p>
        </footer>
          </article>
        </div>
        <SaleTestSummary test={result.saleTest} />
      </div>

      <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-[var(--border)] bg-white p-5 print:hidden sm:p-6">
        <h2 className="text-xl font-black">Riwayat penggantian</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Riwayat ini dapat dibaca Owner, Admin, dan Teknisi.</p>
        {result.replacements.length === 0 ? (
          <p className="mt-5 rounded-xl bg-[var(--background)] p-4 text-sm text-[var(--text-secondary)]">Belum ada penggantian unit.</p>
        ) : (
          <div className="mt-5 divide-y divide-[var(--border)]">
            {result.replacements.map((replacement) => (
              <article className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center" key={replacement.id_replacement}>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-[var(--brand-secondary)]">Penggantian #{replacement.sequence_no} · {formatDate(replacement.replacement_date)}</p>
                  <p className="mt-2 break-words font-black">{replacement.old_unit_id} → {replacement.replacement_unit_id}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{replacement.reason}</p>
                  <p className="mt-2 text-sm font-bold">Nilai {formatCurrency(replacement.replacement_transaction_value)} · selisih {replacement.price_difference > 0 ? "+" : replacement.price_difference < 0 ? "−" : ""}{formatCurrency(Math.abs(replacement.price_difference))}</p>
                </div>
                <Link className="rounded-xl border border-[var(--border)] px-4 py-3 text-center text-sm font-bold hover:border-[var(--brand-primary)]" href={`/sales/${result.sale.id_invoice}/replacement/${replacement.id_replacement}`}>Lihat bukti</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function CurrentMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-xl bg-[var(--background)] p-4"><p className="text-xs font-bold uppercase text-[var(--text-secondary)]">{label}</p><p className="mt-1 break-words font-black">{value}</p></div>;
}

function LoadError() {
  return <main className="mx-auto max-w-3xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-red-700" role="alert">Invoice gagal dimuat.</p></main>;
}
