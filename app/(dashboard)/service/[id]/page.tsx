import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatCurrency, formatDate, todayInJakarta } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { StatusForm } from "./status-form";
import { ServicePartForm } from "./part-form";
import { CancelServiceButton } from "@/components/service/cancel-service-button";

const statuses = ["Diterima", "Diagnosa", "Dikerjakan", "Selesai", "Diambil"] as const;
const orderSchema = z.object({
  id_servis: z.string(),
  id_unit: z.string().nullable(),
  id_customer: z.string().uuid(),
  id_klaim: z.string().uuid().nullable(),
  jenis_servis: z.enum(["Repair", "Install", "Cleaning"]),
  brand_model: z.string(),
  keluhan: z.string(),
  diagnosa: z.string().nullable(),
  tindakan: z.string().nullable(),
  biaya_jasa: z.union([z.number(), z.string()]),
  biaya_part: z.union([z.number(), z.string()]),
  total_biaya: z.union([z.number(), z.string()]),
  status: z.enum(statuses),
  garansi_servis_hari: z.number(),
  tanggal_masuk: z.string(),
  estimasi_selesai: z.string().nullable(),
  tanggal_selesai: z.string().nullable(),
  tanggal_diambil: z.string().nullable(),
  qr_payload: z.string(),
});
const customerSchema = z.object({ nama: z.string(), kontak_wa: z.string().nullable() });
const logsSchema = z.array(z.object({
  id_log: z.string().uuid(),
  id_part: z.string(),
  biaya: z.union([z.number(), z.string()]),
  tanggal: z.string(),
  bank_stock: z.object({ jenis_part: z.string() }),
}));
const partsSchema = z.array(z.object({
  id_part: z.string(),
  jenis_part: z.string(),
  stock_qty: z.number(),
  modal_per_unit: z.union([z.number(), z.string()]),
}));

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const orderResult = await supabase.from("service_orders").select("*").eq("id_servis", id).maybeSingle();
  if (!orderResult.data && !orderResult.error) notFound();
  const order = orderSchema.safeParse(orderResult.data);
  if (orderResult.error || !order.success) return <LoadError />;

  const [customerResult, logsResult, partsResult, authResult] = await Promise.all([
    supabase.from("customers").select("nama, kontak_wa").eq("id_customer", order.data.id_customer).single(),
    supabase.from("service_part_log").select("id_log, id_part, biaya, tanggal, bank_stock!inner(jenis_part)").eq("id_servis", id).order("tanggal", { ascending: false }),
    supabase.from("bank_stock").select("id_part, jenis_part, stock_qty, modal_per_unit").gt("stock_qty", 0).order("jenis_part"),
    supabase.auth.getUser(),
  ]);
  const customer = customerSchema.safeParse(customerResult.data);
  const logs = logsSchema.safeParse(logsResult.data);
  const parts = partsSchema.safeParse(partsResult.data);
  if (!customer.success || !logs.success || !parts.success) return <LoadError />;
  const role = String(authResult.data.user?.app_metadata.role ?? "");
  const currentIndex = statuses.indexOf(order.data.status);
  const warrantyEnd = order.data.tanggal_diambil
    ? addDays(order.data.tanggal_diambil, order.data.garansi_servis_hari)
    : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <Link className="text-sm font-bold text-[#198929] hover:text-[#147522]" href="/service">Kembali ke daftar servis</Link>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-[#198929] p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-bold text-[#ffdc50]">{order.data.id_servis}</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{order.data.brand_model}</h1>
                <p className="mt-3 text-white/75">{order.data.jenis_servis} · {customer.data.nama}</p>
              </div>
              <div className="flex items-center gap-2">
                {role === "owner" && order.data.status !== "Diambil" && <CancelServiceButton idServis={order.data.id_servis} />}
                <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-[#147522]">{order.data.status}</span>
              </div>
            </div>
            <div className="mt-7 grid grid-cols-5 gap-2 border-t border-white/25 pt-6">
              {statuses.map((status, index) => (
                <div className="text-center" key={status}>
                  <div className={`mx-auto size-3 rounded-full ${index <= currentIndex ? "bg-[#ffdc50]" : "bg-white/30"}`} />
                  <p className="mt-2 hidden text-xs font-bold sm:block">{status}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 rounded-2xl border border-[#dde5de] bg-white p-6 sm:grid-cols-2">
            <Detail label="Customer" value={`${customer.data.nama}${customer.data.kontak_wa ? ` · ${customer.data.kontak_wa}` : ""}`} href={`/customers/${order.data.id_customer}`} />
            <Detail label="Tanggal masuk" value={formatDate(order.data.tanggal_masuk)} />
            <Detail label="Estimasi selesai" value={order.data.estimasi_selesai ? formatDate(order.data.estimasi_selesai) : null} />
            <Detail label="Unit BJ Laptop" value={order.data.id_unit} href={order.data.id_unit ? `/units/${order.data.id_unit}` : undefined} />
            <Detail label="Keluhan" value={order.data.keluhan} />
            <Detail label="Diagnosa" value={order.data.diagnosa} />
            <Detail label="Tindakan" value={order.data.tindakan} />
            <Detail label="Klaim garansi" value={order.data.id_klaim ? "Terhubung" : "Bukan klaim"} href={order.data.id_unit && order.data.id_klaim ? `/warranty?unit=${order.data.id_unit}` : undefined} />
          </section>

          <StatusForm id={order.data.id_servis} status={order.data.status} role={role} defaultEstimatedCompletion={order.data.estimasi_selesai ?? ""} />

          {order.data.status === "Dikerjakan" && (
            <section className="rounded-2xl border border-[#dde5de] bg-white p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">F-SVC-03</p>
              <h2 className="mt-2 text-2xl font-black">Pemakaian part</h2>
              <p className="mb-5 mt-2 text-sm text-[#5e6b61]">Harga modal diambil dari Bank Stock dan stok berkurang otomatis.</p>
              <ServicePartForm
                id={order.data.id_servis}
                defaultDate={todayInJakarta()}
                parts={parts.data.map((part) => ({ id: part.id_part, name: part.jenis_part, stock: part.stock_qty, cost: part.modal_per_unit }))}
              />
            </section>
          )}

          <section className="rounded-2xl border border-[#dde5de] bg-white p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">Biaya internal</p><h2 className="mt-2 text-2xl font-black">Rincian servis</h2></div>
              <p className="text-2xl font-black text-[#198929]">{formatCurrency(order.data.total_biaya)}</p>
            </div>
            <div className="mt-5 grid gap-4 border-y border-[#dde5de] py-4 sm:grid-cols-2">
              <Detail label="Biaya jasa" value={formatCurrency(order.data.biaya_jasa)} />
              <Detail label="Biaya part" value={formatCurrency(order.data.biaya_part)} />
            </div>
            {logs.data.length === 0 ? <p className="mt-5 text-[#5e6b61]">Belum ada part yang dipakai.</p> : (
              <div className="mt-4 divide-y divide-[#dde5de]">
                {logs.data.map((log) => (
                  <div className="flex items-center justify-between gap-4 py-4" key={log.id_log}>
                    <div><p className="font-bold">{log.bank_stock.jenis_part}</p><p className="text-sm text-[#5e6b61]">{log.id_part} · {formatDate(log.tanggal)}</p></div>
                    <p className="font-black">{formatCurrency(log.biaya)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {warrantyEnd && (
            <section className="rounded-2xl bg-[#ffdc50]/35 p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Garansi servis</p>
              <p className="mt-2 text-xl font-black">Berlaku sampai {formatDate(warrantyEnd)}</p>
              <p className="mt-1 text-sm text-[#5e6b61]">Dimulai saat perangkat diambil pada {formatDate(order.data.tanggal_diambil!)}.</p>
            </section>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-[#dde5de] bg-white p-6 text-center lg:sticky lg:top-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#5e6b61]">QR tanda terima</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mx-auto mt-4 aspect-square w-full max-w-64" src={`/api/service/${order.data.id_servis}/qr`} alt={`QR ${order.data.id_servis}`} />
          <p className="mt-3 font-mono text-sm font-bold">{order.data.id_servis}</p>
          <Link className="mt-5 block rounded-xl bg-[#198929] px-4 py-3 font-bold text-white hover:bg-[#147522]" href={order.data.qr_payload} target="_blank">Buka status publik</Link>
          <a className="mt-3 block rounded-xl border border-[#198929] px-4 py-3 font-bold text-[#147522]" href={`/api/service/${order.data.id_servis}/qr`} target="_blank">Cetak QR</a>
          {order.data.status === "Diambil" && <Link className="mt-3 block rounded-xl bg-[#ff751f] px-4 py-3 font-bold text-white" href={`/service/${order.data.id_servis}/receipt`}>Buka nota servis</Link>}
        </aside>
      </div>
    </main>
  );
}

function Detail({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return <div><p className="text-xs font-bold uppercase text-[#5e6b61]">{label}</p>{href ? <Link className="mt-2 block font-bold text-[#198929] underline" href={href}>{value ?? "-"}</Link> : <p className="mt-2 whitespace-pre-wrap font-medium">{value ?? "-"}</p>}</div>;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function LoadError() {
  return <main className="mx-auto max-w-5xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Detail servis gagal dimuat.</p></main>;
}
