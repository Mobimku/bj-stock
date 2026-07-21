import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import logoBlack from "@/assets/logo-transparent.svg";
import { PrintButton } from "@/app/(dashboard)/sales/[id]/print-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const orderSchema = z.object({
  id_servis: z.string(),
  id_customer: z.string().uuid(),
  jenis_servis: z.string(),
  brand_model: z.string(),
  keluhan: z.string(),
  tindakan: z.string().nullable(),
  biaya_jasa: z.union([z.number(), z.string()]),
  biaya_part: z.union([z.number(), z.string()]),
  total_biaya: z.union([z.number(), z.string()]),
  status: z.literal("Diambil"),
  garansi_servis_hari: z.number(),
  tanggal_masuk: z.string(),
  tanggal_diambil: z.string(),
});
const customerSchema = z.object({ nama: z.string(), kontak_wa: z.string().nullable() });
const logsSchema = z.array(z.object({
  id_log: z.string().uuid(),
  biaya: z.union([z.number(), z.string()]),
  bank_stock: z.object({ jenis_part: z.string() }),
}));

export default async function ServiceReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const orderResult = await supabase.from("service_orders").select("id_servis, id_customer, jenis_servis, brand_model, keluhan, tindakan, biaya_jasa, biaya_part, total_biaya, status, garansi_servis_hari, tanggal_masuk, tanggal_diambil").eq("id_servis", id).maybeSingle();
  if (!orderResult.data && !orderResult.error) notFound();
  const order = orderSchema.safeParse(orderResult.data);
  if (!order.success) return <ReceiptUnavailable id={id} />;

  const [customerResult, logsResult] = await Promise.all([
    supabase.from("customers").select("nama, kontak_wa").eq("id_customer", order.data.id_customer).single(),
    supabase.from("service_part_log").select("id_log, biaya, bank_stock!inner(jenis_part)").eq("id_servis", id),
  ]);
  const customer = customerSchema.safeParse(customerResult.data);
  const logs = logsSchema.safeParse(logsResult.data);
  if (!customer.success || !logs.success) return <ReceiptUnavailable id={id} />;
  const warrantyEnd = addDays(order.data.tanggal_diambil, order.data.garansi_servis_hari);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:bg-white print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link className="text-sm font-bold text-[#198929]" href={`/service/${id}`}>Kembali ke detail servis</Link>
        <PrintButton label="Cetak nota" />
      </div>
      <article className="rounded-2xl border border-[#dde5de] bg-white p-6 sm:p-10 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-4 border-[#198929] pb-7">
          <div className="flex items-center gap-4">
            <Image className="h-20 w-auto object-contain" src={logoBlack} alt="BJ Laptop" priority />
            <div><p className="text-2xl font-black">BJ Laptop</p><p className="text-sm text-[#5e6b61]">Bangunjiwo</p></div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#5e6b61]">Nota servis</p>
            <h1 className="mt-1 font-mono text-xl font-black">{order.data.id_servis}</h1>
            <p className="mt-1 text-sm text-[#5e6b61]">Diambil {formatDate(order.data.tanggal_diambil)}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-[#dde5de] py-7 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase text-[#5e6b61]">Customer</p><p className="mt-2 text-lg font-black">{customer.data.nama}</p><p className="text-[#5e6b61]">{customer.data.kontak_wa ?? "Kontak tidak dicatat"}</p></div>
          <div className="sm:text-right"><p className="text-xs font-bold uppercase text-[#5e6b61]">Perangkat</p><p className="mt-2 text-lg font-black">{order.data.brand_model}</p><p className="text-[#5e6b61]">{order.data.jenis_servis}</p></div>
        </section>

        <section className="py-7">
          <p className="text-xs font-bold uppercase text-[#5e6b61]">Keluhan</p>
          <p className="mt-2 font-medium">{order.data.keluhan}</p>
          <p className="mt-5 text-xs font-bold uppercase text-[#5e6b61]">Tindakan</p>
          <p className="mt-2 font-medium">{order.data.tindakan ?? "-"}</p>
          <div className="mt-7 divide-y divide-[#dde5de] border-y border-[#dde5de]">
            <CostRow label="Biaya jasa" value={order.data.biaya_jasa} />
            {logs.data.map((log) => <CostRow label={log.bank_stock.jenis_part} value={log.biaya} key={log.id_log} />)}
          </div>
          <div className="mt-5 flex items-center justify-between border-t-2 border-[#172019] pt-4"><p className="font-black">TOTAL</p><p className="text-2xl font-black text-[#198929]">{formatCurrency(order.data.total_biaya)}</p></div>
        </section>

        <footer className="rounded-xl bg-[#ffdc50]/35 p-5 text-sm">
          <p className="font-bold">Garansi servis {order.data.garansi_servis_hari} hari, berlaku sampai {formatDate(warrantyEnd)}.</p>
          <p className="mt-1 text-[#5e6b61]">Simpan nota atau QR order untuk pengecekan berikutnya.</p>
        </footer>
      </article>
    </main>
  );
}

function CostRow({ label, value }: { label: string; value: number | string }) {
  return <div className="flex justify-between gap-4 py-3"><span>{label}</span><strong>{formatCurrency(value)}</strong></div>;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ReceiptUnavailable({ id }: { id: string }) {
  return <main className="mx-auto max-w-3xl px-4 py-12"><p className="rounded-xl bg-[#ffdc50]/35 p-5 font-bold">Nota tersedia setelah status servis menjadi Diambil.</p><Link className="mt-5 inline-block font-bold text-[#198929]" href={`/service/${id}`}>Kembali ke detail</Link></main>;
}
