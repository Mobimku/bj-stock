import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SaleForm } from "./sale-form";

const unitSchema = z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  total_modal: z.union([z.number(), z.string()]),
  harga_listing: z.union([z.number(), z.string()]).nullable(),
  status: z.enum(["Ready", "Listed"]),
});
const customerSchema = z.array(z.object({
  id_customer: z.string().uuid(),
  nama: z.string(),
  kontak_wa: z.string().nullable(),
}));
const settingSchema = z.object({ value: z.coerce.number().int().positive() });

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const unitId = typeof params.unit === "string" ? params.unit : "";
  const supabase = await createClient();
  const [{ data: authData }, unitResult, customerResult, settingResult] = await Promise.all([
    supabase.auth.getUser(),
    unitId
      ? supabase.from("units").select("id_unit, brand, model, total_modal, harga_listing, status").eq("id_unit", unitId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("customers").select("id_customer, nama, kontak_wa").order("nama"),
    supabase.from("app_settings").select("value").eq("key", "default_warranty_unit_days").single(),
  ]);

  if (authData.user?.app_metadata.role !== "admin" && authData.user?.app_metadata.role !== "owner") {
    return <Message text="Hanya admin dan owner yang dapat membuat transaksi penjualan." />;
  }
  if (!unitId) {
    return <Message text="Scan atau pilih unit Ready/Listed sebelum membuat transaksi." scan />;
  }

  const unit = unitSchema.safeParse(unitResult.data);
  const customers = customerSchema.safeParse(customerResult.data);
  const setting = settingSchema.safeParse(settingResult.data);
  if (unitResult.error || !unit.success) {
    return <Message text="Unit tidak ditemukan, sudah terjual, atau belum berstatus Ready/Listed." scan />;
  }
  if (customerResult.error || !customers.success) {
    return <Message text="Daftar customer gagal dimuat." />;
  }
  if (settingResult.error || !setting.success) {
    return <Message text="Konfigurasi durasi garansi gagal dimuat." />;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href="/sales">
        Kembali ke penjualan
      </Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">F-SLS-01 · F-SLS-02</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">Transaksi penjualan</h1>
      <p className="mb-8 mt-2 text-stone-600">Hasil test ditinjau pembeli sebelum pembayaran. Margin dan garansi dihitung otomatis setelah transaksi dikonfirmasi.</p>
      <SaleForm
        unit={{
          id: unit.data.id_unit,
          label: `${unit.data.brand} ${unit.data.model ?? ""}`.trim(),
          totalCapital: unit.data.total_modal,
          listingPrice: unit.data.harga_listing,
        }}
        customers={customers.data.map((customer) => ({
          id: customer.id_customer,
          name: customer.nama,
          wa: customer.kontak_wa,
        }))}
        defaultDate={new Date().toISOString().slice(0, 10)}
        defaultWarrantyDays={setting.data.value}
      />
    </main>
  );
}

function Message({ text, scan = false }: { text: string; scan?: boolean }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="rounded-xl bg-amber-50 p-5 font-medium text-amber-900" role="alert">{text}</p>
      {scan && <Link className="mt-5 inline-block rounded-xl bg-stone-950 px-5 py-3 font-bold text-white" href="/scan?purpose=sale">Scan unit</Link>}
    </main>
  );
}
