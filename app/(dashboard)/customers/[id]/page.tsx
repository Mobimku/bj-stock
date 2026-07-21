import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { EditCustomerButton } from "@/components/customers/edit-customer-button";
import { DeleteCustomerButton } from "@/components/customers/delete-customer-button";

const customerSchema = z.object({
  id_customer: z.string().uuid(),
  nama: z.string(),
  kontak_wa: z.string().nullable(),
  segmen: z.string().nullable(),
  sumber_lead: z.string().nullable(),
  created_at: z.string(),
});
const salesSchema = z.array(z.object({
  id_invoice: z.string(),
  current_unit_id: z.string(),
  current_brand: z.string(),
  current_model: z.string().nullable(),
  current_transaction_value: z.union([z.number(), z.string()]),
  channel: z.string(),
  metode_bayar: z.string(),
  tanggal_transaksi: z.string(),
}));
const servicesSchema = z.array(z.object({
  id_servis: z.string(),
  jenis_servis: z.string(),
  brand_model: z.string(),
  status: z.string(),
  total_biaya: z.union([z.number(), z.string()]),
  tanggal_masuk: z.string(),
}));

type TimelineItem = {
  id: string;
  kind: "Pembelian" | "Servis";
  date: string;
  title: string;
  description: string;
  amount: number | string;
  href: string;
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const [{ data: authData }, customerResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("customers").select("*").eq("id_customer", id).maybeSingle(),
  ]);
  if (!customerResult.data && !customerResult.error) notFound();
  const customer = customerSchema.safeParse(customerResult.data);
  if (customerResult.error || !customer.success) return <LoadError />;
  const role = authData.user?.app_metadata.role ?? "";

  const [salesResult, servicesResult] = await Promise.all([
    supabase.from("sales_current_state").select("id_invoice, current_unit_id, current_brand, current_model, current_transaction_value, channel, metode_bayar, tanggal_transaksi").eq("id_customer", id),
    supabase.from("service_orders").select("id_servis, jenis_servis, brand_model, status, total_biaya, tanggal_masuk").eq("id_customer", id),
  ]);
  const sales = salesSchema.safeParse(salesResult.data);
  const services = servicesSchema.safeParse(servicesResult.data);
  if (salesResult.error || servicesResult.error || !sales.success || !services.success) return <LoadError />;

  const timeline: TimelineItem[] = [
    ...sales.data.map((sale) => ({
      id: sale.id_invoice,
      kind: "Pembelian" as const,
      date: sale.tanggal_transaksi,
      title: `${sale.current_brand} ${sale.current_model ?? ""}`.trim(),
      description: `${sale.current_unit_id} · ${sale.channel} · ${sale.metode_bayar}`,
      amount: sale.current_transaction_value,
      href: `/sales/${sale.id_invoice}`,
    })),
    ...services.data.map((service) => ({
      id: service.id_servis,
      kind: "Servis" as const,
      date: service.tanggal_masuk,
      title: `${service.jenis_servis} · ${service.brand_model}`,
      description: `Status ${service.status}`,
      amount: service.total_biaya,
      href: `/service/${service.id_servis}`,
    })),
  ].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link className="text-sm font-bold text-[#198929] hover:text-[#147522]" href="/customers">Kembali ke daftar customer</Link>
      <section className="mt-6 overflow-hidden rounded-3xl border border-[#dde5de] bg-white">
        <header className="bg-[#198929] p-7 text-white sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffdc50]">Profil customer</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="text-4xl font-black tracking-tight">{customer.data.nama}</h1><p className="mt-2 text-white/75">Terdaftar {formatDate(customer.data.created_at.slice(0, 10))}</p></div>
            <div className="flex items-center gap-2">
              {["admin", "owner"].includes(role) && <EditCustomerButton customer={{ id_customer: customer.data.id_customer, nama: customer.data.nama, kontak_wa: customer.data.kontak_wa, segmen: customer.data.segmen, sumber_lead: customer.data.sumber_lead }} />}
              {["admin", "owner"].includes(role) && <DeleteCustomerButton idCustomer={customer.data.id_customer} />}
              {customer.data.kontak_wa && <a className="rounded-xl bg-white px-5 py-3 font-black text-[#147522]" href={"https://wa.me/" + customer.data.kontak_wa.replace(/\D/g, "")} target="_blank" rel="noreferrer">WA</a>}
            </div>
          </div>
        </header>
        <div className="grid gap-5 p-7 sm:grid-cols-3 sm:p-9">
          <Detail label="Nomor WhatsApp" value={customer.data.kontak_wa} />
          <Detail label="Segmen" value={customer.data.segmen} />
          <Detail label="Sumber lead" value={customer.data.sumber_lead} />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">F-CRM-01</p><h2 className="mt-2 text-3xl font-black">Timeline transaksi</h2></div>
          <p className="text-sm font-bold text-[#5e6b61]">{sales.data.length} pembelian · {services.data.length} servis</p>
        </div>

        {timeline.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[#dde5de] p-12 text-center text-[#5e6b61]">Belum ada transaksi pada profil ini.</div> : (
          <div className="relative mt-6 space-y-4 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-px before:bg-[#dde5de]">
            {timeline.map((item) => (
              <Link className="relative grid grid-cols-[40px_1fr] gap-4 rounded-2xl border border-[#dde5de] bg-white p-5 transition hover:border-[#198929] hover:shadow-md" href={item.href} key={`${item.kind}-${item.id}`}>
                <div className={`relative z-10 flex size-10 items-center justify-center rounded-full text-sm font-black text-white ${item.kind === "Pembelian" ? "bg-[#ff751f]" : "bg-[#198929]"}`}>{item.kind === "Pembelian" ? "J" : "S"}</div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#f7faf7] px-2 py-1 text-xs font-bold">{item.kind}</span><span className="font-mono text-xs text-[#5e6b61]">{item.id}</span></div><h3 className="mt-2 text-xl font-black">{item.title}</h3><p className="mt-1 text-sm text-[#5e6b61]">{item.description}</p></div>
                  <div className="text-right"><p className="font-black text-[#198929]">{formatCurrency(item.amount)}</p><p className="mt-1 text-sm text-[#5e6b61]">{formatDate(item.date)}</p></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <div><p className="text-xs font-bold uppercase text-[#5e6b61]">{label}</p><p className="mt-2 font-black">{value ?? "-"}</p></div>;
}

function LoadError() {
  return <main className="mx-auto max-w-5xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Profil customer gagal dimuat.</p></main>;
}
