import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { unitDetailSchema, upgradeHistorySchema, specHistorySchema } from "@/lib/validation/unit";
import { bankPartSchema } from "@/lib/validation/bank-stock";

const activeReservationSchema = z.object({
  id_reservation: z.string().uuid(),
  customers: z.object({ nama: z.string(), kontak_wa: z.string().nullable() }),
  dp_amount: z.union([z.number(), z.string()]),
  agreed_price: z.union([z.number(), z.string()]),
  is_refundable: z.boolean(),
  expires_at: z.string(),
});

const customerSchema = z.array(z.object({ id_customer: z.string().uuid(), nama: z.string(), kontak_wa: z.string().nullable() }));
const warrantySchema = z.object({ value: z.coerce.number().int().positive() });

export type ActiveReservationData = {
  id: string; customerName: string; customerWa: string | null;
  dpAmount: number | string; agreedPrice: number | string; isRefundable: boolean; expiresAt: string;
};

export type UnitDetailOk = {
  unit: z.infer<typeof unitDetailSchema>;
  upgrades: z.infer<typeof upgradeHistorySchema>;
  parts: z.infer<typeof bankPartSchema>[];
  specHistory: z.infer<typeof specHistorySchema>;
  isAdmin: boolean; isTeknisi: boolean; isOwner: boolean;
  activeReservation: ActiveReservationData | null;
  customers: { id: string; name: string; wa: string | null }[];
  defaultWarrantyDays: number | null;
  warnings: string[];
};

export type UnitDetailResult =
  | { status: "not-found" }
  | { status: "error"; message: string }
  | ({ status: "ok" } & UnitDetailOk);

export async function loadUnitDetailData(id: string): Promise<UnitDetailResult> {
  const supabase = await createClient();
  const [unitResult, historyResult, authResult, partsResult, specHistoryResult, reservationResult, customerListResult, warrantySettingResult] = await Promise.all([
    supabase.from("units").select("*").eq("id_unit", id).maybeSingle(),
    supabase.from("upgrade_log").select("id_log, id_part, jenis, biaya, spek_setelah, tanggal, catatan").eq("id_unit", id).order("tanggal", { ascending: false }),
    supabase.auth.getUser(),
    supabase.from("bank_stock").select("*").gt("stock_qty", 0).order("jenis_part"),
    supabase.from("unit_spec_history").select("id_history, id_unit, spek_saat_ini, kondisi_fisik, kondisi_fungsi, changed_by, changed_at, catatan").eq("id_unit", id).order("changed_at", { ascending: false }),
    supabase.from("reservations").select("id_reservation, dp_amount, agreed_price, is_refundable, expires_at, customers!inner(nama, kontak_wa)").eq("id_unit", id).eq("status", "Dipesan").maybeSingle(),
    supabase.from("customers").select("id_customer, nama, kontak_wa").order("nama"),
    supabase.from("app_settings").select("value").eq("key", "default_warranty_unit_days").single(),
  ]);

  if (!unitResult.data && !unitResult.error) return { status: "not-found" };

  const unit = unitDetailSchema.safeParse(unitResult.data);
  const upgrades = upgradeHistorySchema.safeParse(historyResult.data);
  const parts = z.array(bankPartSchema).safeParse(partsResult.data);
  const specHistory = specHistorySchema.safeParse(specHistoryResult.data);
  const activeReservation = reservationResult.data ? activeReservationSchema.safeParse(reservationResult.data) : null;
  const customerList = customerSchema.safeParse(customerListResult.data);
  const warrantySetting = warrantySchema.safeParse(warrantySettingResult.data);

  if (unitResult.error || historyResult.error || partsResult.error || specHistoryResult.error || !unit.success || !upgrades.success || !parts.success || !specHistory.success) {
    let message = "Detail unit gagal dimuat.";
    if (unitResult.error) message += ` (Unit: ${unitResult.error.message})`;
    return { status: "error", message };
  }

  const isAdmin = ["admin", "owner"].includes(authResult.data.user?.app_metadata.role ?? "");
  const isTeknisi = authResult.data.user?.app_metadata.role === "teknisi";
  const isOwner = authResult.data.user?.app_metadata.role === "owner";

  const warnings: string[] = [];
  let activeReservationItem: ActiveReservationData | null = null;
  if (activeReservation && activeReservation.success) {
    activeReservationItem = {
      id: activeReservation.data.id_reservation,
      customerName: activeReservation.data.customers.nama,
      customerWa: activeReservation.data.customers.kontak_wa,
      dpAmount: activeReservation.data.dp_amount,
      agreedPrice: activeReservation.data.agreed_price,
      isRefundable: activeReservation.data.is_refundable,
      expiresAt: activeReservation.data.expires_at,
    };
  } else if (activeReservation && !activeReservation.success) {
    warnings.push("Data reservasi tidak valid.");
  } else if (reservationResult.error) {
    warnings.push("Data reservasi gagal dimuat.");
  }

  if (!customerList.success) warnings.push("Daftar customer gagal dimuat.");
  if (!warrantySetting.success) warnings.push("Konfigurasi garansi gagal dimuat.");

  return {
    status: "ok",
    unit: unit.data,
    upgrades: upgrades.data,
    parts: parts.data,
    specHistory: specHistory.data,
    isAdmin, isTeknisi, isOwner,
    activeReservation: activeReservationItem,
    customers: customerList.success ? customerList.data.map(c => ({ id: c.id_customer, name: c.nama, wa: c.kontak_wa })) : [],
    defaultWarrantyDays: warrantySetting.success ? warrantySetting.data.value : null,
    warnings,
  };
}
