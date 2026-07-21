import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import logoBlack from "@/assets/logo-transparent.svg";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../print-button";

const replacementSchema = z.object({
  id_replacement: z.string().uuid(),
  id_invoice: z.string(),
  sequence_no: z.number().int().positive(),
  old_unit_id: z.string(),
  replacement_unit_id: z.string(),
  new_warranty_id: z.string().uuid(),
  replacement_date: z.string(),
  previous_transaction_value: z.coerce.number(),
  replacement_transaction_value: z.coerce.number(),
  price_difference: z.coerce.number(),
  reason: z.string(),
});
const saleSchema = z.object({
  id_invoice: z.string(),
  id_unit: z.string(),
  id_customer: z.string().uuid().nullable(),
  harga_jual: z.coerce.number(),
  tanggal_transaksi: z.string(),
});
const unitsSchema = z.array(z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  serial_number: z.string().nullable(),
}));
const customerSchema = z.object({ nama: z.string(), kontak_wa: z.string().nullable() });
const warrantySchema = z.object({ tanggal_berakhir: z.string() });

export default async function ReplacementProofPage({
  params,
}: {
  params: Promise<{ id: string; replacementId: string }>;
}) {
  const { id, replacementId } = await params;
  const supabase = await createClient();
  const replacementResult = await supabase
    .from("warranty_replacements")
    .select("id_replacement, id_invoice, sequence_no, old_unit_id, replacement_unit_id, new_warranty_id, replacement_date, previous_transaction_value, replacement_transaction_value, price_difference, reason")
    .eq("id_invoice", id)
    .eq("id_replacement", replacementId)
    .maybeSingle();
  if (!replacementResult.data && !replacementResult.error) notFound();
  const replacement = replacementSchema.safeParse(replacementResult.data);
  if (replacementResult.error || !replacement.success) return <LoadError />;

  const saleResult = await supabase
    .from("sales")
    .select("id_invoice, id_unit, id_customer, harga_jual, tanggal_transaksi")
    .eq("id_invoice", id)
    .single();
  const sale = saleSchema.safeParse(saleResult.data);
  if (saleResult.error || !sale.success) return <LoadError />;

  const [unitsResult, customerResult, warrantyResult] = await Promise.all([
    supabase.from("units").select("id_unit, brand, model, serial_number").in("id_unit", [sale.data.id_unit, replacement.data.old_unit_id, replacement.data.replacement_unit_id]),
    sale.data.id_customer
      ? supabase.from("customers").select("nama, kontak_wa").eq("id_customer", sale.data.id_customer).single()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("warranty").select("tanggal_berakhir").eq("id_garansi", replacement.data.new_warranty_id).single(),
  ]);
  const units = unitsSchema.safeParse(unitsResult.data);
  const customer = customerSchema.nullable().safeParse(customerResult.data);
  const warranty = warrantySchema.safeParse(warrantyResult.data);
  if (unitsResult.error || customerResult.error || warrantyResult.error
    || !units.success || !customer.success || !warranty.success) return <LoadError />;
  const originalUnit = units.data.find((unit) => unit.id_unit === sale.data.id_unit);
  const oldUnit = units.data.find((unit) => unit.id_unit === replacement.data.old_unit_id);
  const newUnit = units.data.find((unit) => unit.id_unit === replacement.data.replacement_unit_id);
  if (!originalUnit || !oldUnit || !newUnit) return <LoadError />;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:bg-white print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link className="text-sm font-bold text-[var(--brand-primary)] hover:brightness-75" href={`/sales/${id}`}>Kembali ke invoice</Link>
        <PrintButton label="Cetak bukti" />
      </div>
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-10 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-5 border-b-4 border-[var(--text-primary)] pb-6">
          <div>
            <Image className="h-14 w-auto object-contain" src={logoBlack} alt="BJ Laptop" priority />
            <p className="mt-2 text-sm text-[var(--text-secondary)]">BJ Laptop · Bangunjiwo</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand-secondary)]">Bukti penggantian</p>
            <h1 className="mt-1 text-xl font-black">#{replacement.data.sequence_no}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatDate(replacement.data.replacement_date)}</p>
          </div>
        </header>

        <section className="grid gap-5 border-b border-[var(--border)] py-6 sm:grid-cols-2">
          <ProofField label="Invoice asli" value={sale.data.id_invoice} mono />
          <ProofField label="Tanggal invoice" value={formatDate(sale.data.tanggal_transaksi)} alignRight />
          <ProofField label="Customer" value={customer.data?.nama ?? "Customer tidak tercatat"} />
          <ProofField label="Kontak" value={customer.data?.kontak_wa ?? "Tidak dicatat"} alignRight />
          <ProofField label="Unit invoice asli" value={`${originalUnit.id_unit} · ${originalUnit.brand} ${originalUnit.model ?? ""}`} mono />
          <ProofField label="Nilai invoice asli" value={formatCurrency(sale.data.harga_jual)} alignRight />
        </section>

        <section className="py-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Unit yang diganti</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
            <UnitCard label="Unit lama" unit={oldUnit} />
            <div className="flex items-center justify-center font-black text-[var(--brand-secondary)]">menjadi</div>
            <UnitCard label="Unit pengganti" unit={newUnit} />
          </div>
        </section>

        <section className="grid gap-4 border-y border-[var(--border)] py-6 sm:grid-cols-3">
          <ProofField label="Nilai sebelumnya" value={formatCurrency(replacement.data.previous_transaction_value)} />
          <ProofField label="Nilai pengganti" value={formatCurrency(replacement.data.replacement_transaction_value)} />
          <ProofField label="Selisih" value={`${replacement.data.price_difference > 0 ? "+" : replacement.data.price_difference < 0 ? "−" : ""}${formatCurrency(Math.abs(replacement.data.price_difference))}`} />
        </section>

        <section className="grid gap-5 py-6 sm:grid-cols-2">
          <ProofField label="Garansi unit pengganti berakhir" value={formatDate(warranty.data.tanggal_berakhir)} />
          <ProofField label="ID audit penggantian" value={replacement.data.id_replacement} mono alignRight />
          <div className="sm:col-span-2">
            <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">Alasan penggantian</p>
            <p className="mt-2 whitespace-pre-wrap break-words font-bold">{replacement.data.reason}</p>
          </div>
        </section>

        <footer className="rounded-xl bg-[var(--background)] p-4 text-sm text-[var(--text-secondary)]">
          Dokumen ini adalah bukti penggantian untuk invoice asli di atas, bukan invoice penjualan baru.
        </footer>
      </article>
    </main>
  );
}

function UnitCard({ label, unit }: { readonly label: string; readonly unit: z.infer<typeof unitsSchema>[number] }) {
  return <div className="min-w-0 rounded-xl bg-[var(--background)] p-4"><p className="text-xs font-bold uppercase text-[var(--text-secondary)]">{label}</p><p className="mt-2 break-all font-mono text-sm font-black">{unit.id_unit}</p><p className="mt-1 font-black">{unit.brand} {unit.model}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">Serial: {unit.serial_number ?? "-"}</p></div>;
}

function ProofField({ label, value, mono = false, alignRight = false }: { readonly label: string; readonly value: string; readonly mono?: boolean; readonly alignRight?: boolean }) {
  return <div className={alignRight ? "sm:text-right" : ""}><p className="text-xs font-bold uppercase text-[var(--text-secondary)]">{label}</p><p className={`mt-1 break-all font-black ${mono ? "font-mono text-sm" : ""}`}>{value}</p></div>;
}

function LoadError() {
  return <main className="mx-auto max-w-3xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-red-700" role="alert">Bukti penggantian gagal dimuat.</p></main>;
}
