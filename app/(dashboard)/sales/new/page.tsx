import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SaleForm } from "./sale-form";
import { ReservationCompletionForm } from "./reservation-completion-form";

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

const reservationQuerySchema = z.object({
  id_reservation: z.string().uuid(),
  id_unit: z.string(),
  dp_amount: z.union([z.number(), z.string()]),
  agreed_price: z.union([z.number(), z.string()]),
  is_refundable: z.boolean(),
  expires_at: z.string(),
  status: z.literal("Dipesan"),
  units: z.object({
    id_unit: z.string(),
    brand: z.string(),
    model: z.string().nullable(),
    total_modal: z.union([z.number(), z.string()]),
    harga_listing: z.union([z.number(), z.string()]).nullable(),
  }),
  customers: z.object({ nama: z.string(), kontak_wa: z.string().nullable() }),
});

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const unitId = typeof params.unit === "string" ? params.unit : "";
  const reservationId = typeof params.reservation === "string" ? params.reservation : "";
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!["admin", "owner"].includes(authData.user?.app_metadata.role ?? "")) {
    return <Message text="Hanya admin dan owner yang dapat membuat transaksi." />;
  }

  // Reservation completion mode takes precedence
  if (reservationId && z.string().uuid().safeParse(reservationId).success) {
    const [resResult, settingResult] = await Promise.all([
      supabase.from("reservations")
        .select("id_reservation, id_unit, dp_amount, agreed_price, is_refundable, expires_at, status, created_at, units!inner(id_unit, brand, model, total_modal, harga_listing), customers!inner(nama, kontak_wa)")
        .eq("id_reservation", reservationId).maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "default_warranty_unit_days").single(),
    ]);
    const reservation = reservationQuerySchema.safeParse(resResult.data);
    const setting = settingSchema.safeParse(settingResult.data);
    if (!reservation.success) return <Message text="Reservasi tidak ditemukan atau sudah selesai/dibatalkan." />;
    if (!setting.success) return <Message text="Konfigurasi garansi gagal dimuat." />;
    return (
      <Shell backHref="/sales?view=reservations" code="F-RSV-02 · F-SLS-02" title="Pelunasan reservasi" subtitle="Lakukan pengujian unit dan konfirmasi pelunasan.">
        <ReservationCompletionForm
          reservation={{
            id: reservation.data.id_reservation,
            unit: { id: reservation.data.id_unit, label: `${reservation.data.units.brand} ${reservation.data.units.model ?? ""}`.trim(), totalCapital: reservation.data.units.total_modal, listingPrice: reservation.data.units.harga_listing },
            customer: { id: "", name: reservation.data.customers.nama, wa: reservation.data.customers.kontak_wa },
            dpAmount: Number(reservation.data.dp_amount), agreedPrice: Number(reservation.data.agreed_price),
            expiresAt: reservation.data.expires_at, isRefundable: reservation.data.is_refundable,
          }}
          defaultWarrantyDays={setting.data.value}
        />
      </Shell>
    );
  }

  // Normal sale mode
  const [unitResult, unitsResult, customerResult, settingResult] = await Promise.all([
    unitId
      ? supabase.from("units").select("id_unit, brand, model, total_modal, harga_listing, status").eq("id_unit", unitId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("units").select("id_unit, brand, model, total_modal, harga_listing, status").in("status", ["Ready", "Listed"]).order("brand"),
    supabase.from("customers").select("id_customer, nama, kontak_wa").order("nama"),
    supabase.from("app_settings").select("value").eq("key", "default_warranty_unit_days").single(),
  ]);

  const allUnits = z.array(unitSchema).safeParse(unitsResult.data);
  const singleUnit = unitSchema.safeParse(unitResult.data);
  const customers = customerSchema.safeParse(customerResult.data);
  const setting = settingSchema.safeParse(settingResult.data);

  if (!allUnits.success || allUnits.data.length === 0) {
    return <Message text="Tidak ada unit berstatus Ready atau Listed. Scan atau pilih unit terlebih dahulu." scan />;
  }
  if (customerResult.error || !customers.success) return <Message text="Daftar customer gagal dimuat." />;
  if (settingResult.error || !setting.success) return <Message text="Konfigurasi durasi garansi gagal dimuat." />;
  if (unitId && !singleUnit.success) return <Message text="Unit tidak ditemukan, sudah terjual, atau belum berstatus Ready/Listed." scan />;

  const mapUnit = (u: z.infer<typeof unitSchema>) => ({
    id: u.id_unit, label: `${u.brand} ${u.model ?? ""}`.trim(),
    totalCapital: u.total_modal, listingPrice: u.harga_listing,
  });

  return (
      <Shell backHref="/sales" code="F-SLS-01 · F-SLS-02 · F-RSV-01" title="Transaksi penjualan" subtitle="Hasil test ditinjau pembeli sebelum pembayaran (penjualan langsung). Margin dan garansi dihitung otomatis.">
      <SaleForm
        units={allUnits.data.map(mapUnit)}
        preselectedUnitId={singleUnit.success ? singleUnit.data.id_unit : ""}
        customers={customers.data.map((c) => ({ id: c.id_customer, name: c.nama, wa: c.kontak_wa }))}
        defaultDate={new Date().toISOString().slice(0, 10)}
        defaultWarrantyDays={setting.data.value}
      />
    </Shell>
  );
}

function Shell({ backHref, code, title, subtitle, children }: { readonly backHref: string; readonly code: string; readonly title: string; readonly subtitle: string; readonly children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href={backHref}>Kembali</Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">{code}</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">{title}</h1>
      <p className="mb-8 mt-2 text-stone-600">{subtitle}</p>
      {children}
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
