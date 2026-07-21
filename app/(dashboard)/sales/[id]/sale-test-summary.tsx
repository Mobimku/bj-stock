import { formatDateTime } from "@/lib/format";
import {
  SALE_TEST_CATEGORIES,
  SALE_TEST_STATUS_SHORT,
} from "../sale-test-contract";
import type { SaleUnitTestSnapshot } from "./sale-detail-data";

export function SaleTestSummary({ test }: { readonly test: SaleUnitTestSnapshot | null }) {
  if (!test) {
    return (
      <aside className="sale-test-print-panel mx-auto w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-6" aria-label="Hasil pengujian unit">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-secondary)]">Pengujian unit</p>
        <h2 className="mt-2 text-xl font-black">Riwayat lama</h2>
        <p className="mt-3 rounded-xl bg-[var(--background)] p-4 text-sm text-[var(--text-secondary)]">Transaksi lama ini belum memiliki hasil pengujian pra-pembayaran.</p>
      </aside>
    );
  }

  return (
    <aside className="sale-test-print-panel sale-test-print-complete mx-auto w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-6" aria-label="Hasil pengujian unit">
      <header className="sale-test-print-header border-b-2 border-[var(--text-primary)] pb-4 print:pb-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-secondary)]">Lampiran invoice</p>
        <h2 className="mt-1 text-xl font-black print:mt-0.5 print:text-[10pt]">Hasil pengujian unit</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)] print:text-[6.5pt]">{test.location} · {formatDateTime(test.confirmed_at)}</p>
        <p className="mt-1 break-all text-xs text-[var(--text-secondary)] print:text-[6.5pt]">Penguji: {test.tester_email}</p>
      </header>

      <table className="sale-test-table mt-4 w-full table-fixed border-collapse text-left text-xs print:mt-0">
        <colgroup><col className="w-[32%]" /><col className="w-[10%]" /><col /></colgroup>
        <thead>
          <tr className="bg-stone-100">
            <th className="border border-stone-300 p-2 font-black">Kategori</th>
            <th className="border border-stone-300 p-2 text-center font-black">Hasil</th>
            <th className="border border-stone-300 p-2 font-black">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {SALE_TEST_CATEGORIES.map((category) => {
            const result = test.test_results[category.key];
            return (
              <tr key={category.key}>
                <th className="border border-stone-300 p-2 align-top font-bold">{category.label}</th>
                <td className="border border-stone-300 p-2 text-center align-top font-black">{SALE_TEST_STATUS_SHORT[result.status]}</td>
                <td className="whitespace-pre-wrap break-words border border-stone-300 p-2 align-top">{result.note ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className="sale-test-acknowledgement mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-stone-700 print:mt-0">
        <strong>Persetujuan pembeli:</strong> {test.acknowledgement_text}
      </footer>
    </aside>
  );
}
