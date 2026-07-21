import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayInJakarta } from "@/lib/format";
import { ServiceForm } from "./service-form";

const unitSchema = z.object({ id_unit: z.string(), brand: z.string(), model: z.string().nullable() });
const customerSchema = z.array(z.object({
  id_customer: z.string().uuid(),
  nama: z.string(),
  kontak_wa: z.string().nullable(),
}));
const saleSchema = z.object({ id_customer: z.string().uuid().nullable() }).nullable();
const warrantySchema = z.object({ status: z.enum(["Aktif", "Habis"]) });

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const unitId = typeof params.unit === "string" ? params.unit.trim().toUpperCase() : "";
  const defaultClaim = params.claim === "1";
  const supabase = await createClient();
  const [authResult, customerResult, unitResult, saleResult, warrantyResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("customers").select("id_customer, nama, kontak_wa").order("nama"),
    unitId
      ? supabase.from("units").select("id_unit, brand, model").eq("id_unit", unitId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    unitId
      ? supabase.from("sales_current_state").select("id_customer").eq("current_unit_id", unitId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    unitId
      ? supabase.rpc("refresh_unit_warranty", { p_id_unit: unitId }).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const role = authResult.data.user?.app_metadata.role;
  const customers = customerSchema.safeParse(customerResult.data);
  const unit = unitSchema.safeParse(unitResult.data);
  const sale = saleSchema.safeParse(saleResult.data);
  const warranty = warrantySchema.safeParse(warrantyResult.data);

  if (!["admin", "teknisi", "owner"].includes(role ?? "")) return <Message text="Role tidak diizinkan menerima servis." />;
  if (customerResult.error || !customers.success) return <Message text="Daftar customer gagal dimuat." />;
  if (unitId && (unitResult.error || !unit.success)) return <Message text="Unit BJ Laptop tidak ditemukan." scan />;
  if (unitId && (saleResult.error || !sale.success)) return <Message text="Data customer unit gagal dimuat." />;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link className="text-sm font-bold text-[#198929] hover:text-[#147522]" href="/service">Kembali ke daftar servis</Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">F-SVC-01</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">Terima order servis</h1>
      <p className="mt-2 text-[#5e6b61]">Order mendapat ID dan QR publik segera setelah disimpan.</p>
      <div className="my-7 grid gap-3 sm:grid-cols-2">
        <Link className={`rounded-xl border p-4 font-bold ${unitId ? "border-[#198929] bg-[#198929]/10 text-[#147522]" : "border-[#dde5de] bg-white"}`} href="/scan?purpose=service">Scan unit BJ Laptop</Link>
        <Link className={`rounded-xl border p-4 font-bold ${!unitId ? "border-[#198929] bg-[#198929]/10 text-[#147522]" : "border-[#dde5de] bg-white"}`} href="/service/new">Servis customer luar</Link>
      </div>
      <ServiceForm
        unit={unit.success ? { id: unit.data.id_unit, label: `${unit.data.brand} ${unit.data.model ?? ""}`.trim() } : null}
        customers={customers.data.map((customer) => ({ id: customer.id_customer, name: customer.nama, wa: customer.kontak_wa }))}
        defaultCustomerId={sale.success ? sale.data?.id_customer ?? "" : ""}
        defaultDate={todayInJakarta()}
        canCreateClaim={["admin", "owner"].includes(role ?? "") && warranty.success && warranty.data.status === "Aktif"}
        defaultClaim={defaultClaim}
      />
    </main>
  );
}

function Message({ text, scan = false }: { text: string; scan?: boolean }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="rounded-xl bg-red-50 p-5 font-medium text-[#c62828]" role="alert">{text}</p>
      {scan && <Link className="mt-5 inline-block rounded-xl bg-[#198929] px-5 py-3 font-bold text-white" href="/scan?purpose=service">Scan ulang unit</Link>}
    </main>
  );
}
