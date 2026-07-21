import Link from "next/link";
import { z } from "zod";
import { formatDate, todayInJakarta } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const customersSchema = z.array(z.object({
  id_customer: z.string().uuid(),
  nama: z.string(),
  kontak_wa: z.string().nullable(),
  segmen: z.string().nullable(),
  sumber_lead: z.string().nullable(),
  created_at: z.string(),
}));
const salesSchema = z.array(z.object({
  id_invoice: z.string(),
  id_customer: z.string().uuid().nullable(),
  current_unit_id: z.string(),
  current_warranty_end: z.string().nullable(),
  current_warranty_status: z.enum(["Aktif", "Habis"]).nullable(),
}));
const servicesSchema = z.array(z.object({ id_customer: z.string().uuid() }));

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = z.string().trim().max(100).catch("").parse(typeof params.q === "string" ? params.q : "");
  const today = todayInJakarta();
  const deadline = addDays(today, 7);
  const supabase = await createClient();
  const [customerResult, salesResult, servicesResult] = await Promise.all([
    fetchAll((from, to) => supabase.from("customers").select("id_customer, nama, kontak_wa, segmen, sumber_lead, created_at").order("nama").range(from, to)),
    fetchAll((from, to) => supabase.from("sales_current_state").select("id_invoice, id_customer, current_unit_id, current_warranty_end, current_warranty_status").range(from, to)),
    fetchAll((from, to) => supabase.from("service_orders").select("id_customer").range(from, to)),
  ]);
  const customers = customersSchema.safeParse(customerResult.data);
  const sales = salesSchema.safeParse(salesResult.data);
  const services = servicesSchema.safeParse(servicesResult.data);

  if (customerResult.error || salesResult.error || servicesResult.error || !customers.success || !sales.success || !services.success) {
    return <LoadError />;
  }

  const normalizedQuery = query.toLocaleLowerCase("id-ID");
  const filteredCustomers = customers.data.filter((customer) =>
    !normalizedQuery
    || customer.nama.toLocaleLowerCase("id-ID").includes(normalizedQuery)
    || customer.kontak_wa?.includes(query),
  );
  const salesCount = countByCustomer(sales.data);
  const serviceCount = countByCustomer(services.data);
  const customerById = new Map(customers.data.map((customer) => [customer.id_customer, customer]));
  const expiring = sales.data.flatMap((sale) => {
    const customer = sale.id_customer ? customerById.get(sale.id_customer) : undefined;
    return customer
      && sale.current_warranty_status === "Aktif"
      && sale.current_warranty_end
      && sale.current_warranty_end >= today
      && sale.current_warranty_end <= deadline
      ? [{ ...sale, current_warranty_end: sale.current_warranty_end, customer }]
      : [];
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">CRM</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Customer</h1>
        <p className="mt-2 text-[#5e6b61]">Satu profil untuk seluruh pembelian dan order servis.</p>
      </div>

      <form className="mt-8 flex gap-3 rounded-2xl border border-[#dde5de] bg-white p-4" method="get">
        <label className="flex-1 text-xs font-bold uppercase tracking-wide text-[#5e6b61]">
          Cari nama atau WhatsApp
          <input className="mt-1 w-full rounded-xl border border-[#dde5de] px-4 py-3 text-base font-normal text-[#172019] outline-none focus:border-[#198929]" name="q" defaultValue={query} maxLength={100} placeholder="Nama / 62812..." />
        </label>
        <button className="self-end rounded-xl bg-[#198929] px-5 py-3 font-bold text-white hover:bg-[#147522]" type="submit">Cari</button>
        {query && <Link className="self-end rounded-xl px-4 py-3 font-bold text-[#5e6b61]" href="/customers">Reset</Link>}
      </form>

      <section className="mt-8 rounded-2xl border border-[#ffdc50] bg-[#ffdc50]/20 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a5a00]">Follow-up manual</p><h2 className="mt-2 text-2xl font-black">Garansi habis dalam 7 hari</h2></div>
          <span className="rounded-full bg-[#ffdc50] px-3 py-1 text-sm font-black">{expiring.length} unit</span>
        </div>
        {expiring.length === 0 ? <p className="mt-4 text-[#5e6b61]">Tidak ada garansi unit yang mendekati tanggal berakhir.</p> : (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {expiring.map((item) => (
              <div className="flex items-center justify-between gap-4 rounded-xl bg-white p-4" key={item.id_invoice}>
                <div><Link className="font-black text-[#198929]" href={`/customers/${item.customer.id_customer}`}>{item.customer.nama}</Link><p className="mt-1 font-mono text-xs text-[#5e6b61]">{item.current_unit_id}</p><p className="mt-1 text-sm">Berakhir {formatDate(item.current_warranty_end)} · {daysBetween(today, item.current_warranty_end)} hari</p></div>
                {item.customer.kontak_wa && <a className="rounded-lg bg-[#198929] px-3 py-2 text-sm font-bold text-white" href={`https://wa.me/${item.customer.kontak_wa.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
              </div>
            ))}
          </div>
        )}
      </section>

      {filteredCustomers.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-[#dde5de] p-12 text-center text-[#5e6b61]">Customer tidak ditemukan.</div> : (
        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCustomers.map((customer) => (
            <Link className="group rounded-2xl border border-[#dde5de] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#198929] hover:shadow-md" href={`/customers/${customer.id_customer}`} key={customer.id_customer}>
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-xl font-black group-hover:text-[#147522]">{customer.nama}</h2><p className="mt-1 text-sm text-[#5e6b61]">{customer.kontak_wa ?? "Tanpa nomor WA"}</p></div>
                <span className="rounded-full bg-[#198929]/10 px-2.5 py-1 text-xs font-bold text-[#147522]">{customer.segmen ?? "Belum ada segmen"}</span>
              </div>
              <div className="mt-7 grid grid-cols-3 gap-3 border-t border-[#dde5de] pt-4 text-sm">
                <div><p className="text-xs font-bold uppercase text-[#5e6b61]">Pembelian</p><p className="mt-1 text-lg font-black">{salesCount.get(customer.id_customer) ?? 0}</p></div>
                <div><p className="text-xs font-bold uppercase text-[#5e6b61]">Servis</p><p className="mt-1 text-lg font-black">{serviceCount.get(customer.id_customer) ?? 0}</p></div>
                <div><p className="text-xs font-bold uppercase text-[#5e6b61]">Sumber</p><p className="mt-1 font-bold">{customer.sumber_lead ?? "-"}</p></div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

function countByCustomer(rows: readonly { readonly id_customer: string | null }[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    if (row.id_customer) counts.set(row.id_customer, (counts.get(row.id_customer) ?? 0) + 1);
  });
  return counts;
}

async function fetchAll(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
) {
  const data: unknown[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    data.push(...page);
    if (page.length < pageSize) return { data, error: null };
  }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function LoadError() {
  return <main className="mx-auto max-w-5xl px-4 py-12"><p className="rounded-xl bg-red-50 p-4 text-[#c62828]" role="alert">Data CRM gagal dimuat.</p></main>;
}
