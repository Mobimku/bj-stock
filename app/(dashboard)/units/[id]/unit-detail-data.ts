import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { unitDetailSchema, upgradeHistorySchema, specHistorySchema } from "@/lib/validation/unit";
import { bankPartSchema } from "@/lib/validation/bank-stock";

export type UnitDetailOk = {
  unit: z.infer<typeof unitDetailSchema>;
  upgrades: z.infer<typeof upgradeHistorySchema>;
  parts: z.infer<typeof bankPartSchema>[];
  specHistory: z.infer<typeof specHistorySchema>;
  isAdmin: boolean; isTeknisi: boolean; isOwner: boolean;
  activeReservationId: string | null;
  warnings: string[];
};

export type UnitDetailResult =
  | { status: "not-found" }
  | { status: "error"; message: string }
  | ({ status: "ok" } & UnitDetailOk);

export async function loadUnitDetailData(id: string): Promise<UnitDetailResult> {
  const supabase = await createClient();
  const [unitResult, historyResult, authResult, partsResult, specHistoryResult, reservationResult] = await Promise.all([
    supabase.from("units").select("*").eq("id_unit", id).maybeSingle(),
    supabase.from("upgrade_log").select("id_log, id_part, jenis, biaya, spek_setelah, tanggal, catatan").eq("id_unit", id).order("tanggal", { ascending: false }),
    supabase.auth.getUser(),
    supabase.from("bank_stock").select("*").gt("stock_qty", 0).order("jenis_part"),
    supabase.from("unit_spec_history").select("id_history, id_unit, spek_saat_ini, kondisi_fisik, kondisi_fungsi, changed_by, changed_at, catatan").eq("id_unit", id).order("changed_at", { ascending: false }),
    supabase.from("reservations").select("id_reservation").eq("id_unit", id).eq("status", "Dipesan").maybeSingle(),
  ]);

  if (!unitResult.data && !unitResult.error) return { status: "not-found" };

  const unit = unitDetailSchema.safeParse(unitResult.data);
  const upgrades = upgradeHistorySchema.safeParse(historyResult.data);
  const parts = z.array(bankPartSchema).safeParse(partsResult.data);
  const specHistory = specHistorySchema.safeParse(specHistoryResult.data);

  if (unitResult.error || historyResult.error || partsResult.error || specHistoryResult.error || !unit.success || !upgrades.success || !parts.success || !specHistory.success) {
    let message = "Detail unit gagal dimuat.";
    if (unitResult.error) message += ` (Unit: ${unitResult.error.message})`;
    return { status: "error", message };
  }

  const isAdmin = ["admin", "owner"].includes(authResult.data.user?.app_metadata.role ?? "");
  const isTeknisi = authResult.data.user?.app_metadata.role === "teknisi";
  const isOwner = authResult.data.user?.app_metadata.role === "owner";

  const warnings: string[] = [];
  let activeReservationId: string | null = null;
  if (reservationResult.data && !reservationResult.error) {
    activeReservationId = reservationResult.data.id_reservation;
  } else if (reservationResult.error) {
    warnings.push("Data reservasi gagal dimuat.");
  }

  return {
    status: "ok",
    unit: unit.data,
    upgrades: upgrades.data,
    parts: parts.data,
    specHistory: specHistory.data,
    isAdmin, isTeknisi, isOwner,
    activeReservationId,
    warnings,
  };
}
