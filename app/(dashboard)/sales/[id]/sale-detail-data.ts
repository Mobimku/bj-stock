import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const moneySchema = z.coerce.number();
const authSchema = z.object({
  user: z.object({
    app_metadata: z.object({ role: z.enum(["owner", "admin", "teknisi"]) }).passthrough(),
  }).nullable(),
});
const saleSchema = z.object({
  id_invoice: z.string(),
  id_unit: z.string(),
  id_customer: z.string().uuid().nullable(),
  id_sale_test: z.string().uuid().nullable(),
  harga_jual: moneySchema,
  channel: z.string(),
  metode_bayar: z.string(),
  tanggal_transaksi: z.string(),
});
const currentStateSchema = z.object({
  current_unit_id: z.string(),
  current_transaction_value: moneySchema,
  replacement_count: z.coerce.number().int().nonnegative(),
  current_warranty_id: z.string().uuid().nullable(),
  current_warranty_start: z.string().nullable(),
  current_warranty_end: z.string().nullable(),
  current_warranty_status: z.enum(["Aktif", "Habis"]).nullable(),
}).nullable();
const unitSchema = z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  serial_number: z.string().nullable(),
});
const customerSchema = z.object({ nama: z.string(), kontak_wa: z.string().nullable() });
const warrantySchema = z.object({ tanggal_berakhir: z.string() });
const replacementSchema = z.object({
  id_replacement: z.string().uuid(),
  sequence_no: z.number().int().positive(),
  id_klaim: z.string().uuid(),
  old_unit_id: z.string(),
  replacement_unit_id: z.string(),
  replacement_date: z.string(),
  previous_transaction_value: moneySchema,
  replacement_transaction_value: moneySchema,
  price_difference: moneySchema,
  reason: z.string(),
});
const replacementsSchema = z.array(replacementSchema);
const claimsSchema = z.array(z.object({
  id_klaim: z.string().uuid(),
  tanggal: z.string(),
  keluhan: z.string(),
}));
const candidatesSchema = z.array(z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  status: z.enum(["Ready", "Listed"]),
  harga_listing: moneySchema.nullable(),
}));
const accountsSchema = z.array(z.object({ id_account: z.string().uuid(), nama: z.string() }));
const saleTestResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("Lulus"),
    note: z.string().max(160).nullable().optional(),
  }),
  z.strictObject({
    status: z.enum(["Ada Catatan", "Tidak Diuji"]),
    note: z.string().trim().min(1).max(160),
  }),
]);
const saleUnitTestSnapshotSchema = z.object({
  id_sale_test: z.string().uuid(),
  id_unit: z.string(),
  test_results: z.strictObject({
    identity_spec_serial: saleTestResultSchema,
    physical_casing_hinges: saleTestResultSchema,
    display_dead_pixels: saleTestResultSchema,
    keyboard_touchpad: saleTestResultSchema,
    wifi_bluetooth: saleTestResultSchema,
    av_devices: saleTestResultSchema,
    usb_ports: saleTestResultSchema,
    display_output: saleTestResultSchema,
    battery_charging_charger: saleTestResultSchema,
    storage_health: saleTestResultSchema,
    boot_os_locks: saleTestResultSchema,
    included_accessories: saleTestResultSchema,
  }),
  blocking_checks: z.strictObject({
    identity_mismatch: z.literal(false),
    serial_mismatch: z.literal(false),
    spec_mismatch: z.literal(false),
    swollen_battery: z.literal(false),
    bios_lock: z.literal(false),
    mdm_lock: z.literal(false),
    unsafe_charger: z.literal(false),
  }),
  location: z.string().trim().min(1).max(120),
  tester_email: z.email(),
  acknowledgement_text: z.string().min(1),
  confirmed_at: z.iso.datetime({ offset: true }),
});

export type ReplacementClaim = z.infer<typeof claimsSchema>[number];
export type ReplacementCandidate = z.infer<typeof candidatesSchema>[number];
export type FinanceAccount = z.infer<typeof accountsSchema>[number];
export type SaleUnitTestSnapshot = z.infer<typeof saleUnitTestSnapshotSchema>;

export async function loadSaleDetail(idInvoice: string) {
  const supabase = await createClient();
  const [authResult, saleResult, stateResult, replacementsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("sales").select("id_invoice, id_unit, id_customer, id_sale_test, harga_jual, channel, metode_bayar, tanggal_transaksi").eq("id_invoice", idInvoice).maybeSingle(),
    supabase.from("sales_current_state").select("current_unit_id, current_transaction_value, replacement_count, current_warranty_id, current_warranty_start, current_warranty_end, current_warranty_status").eq("id_invoice", idInvoice).maybeSingle(),
    supabase.from("warranty_replacements").select("id_replacement, sequence_no, id_klaim, old_unit_id, replacement_unit_id, replacement_date, previous_transaction_value, replacement_transaction_value, price_difference, reason").eq("id_invoice", idInvoice).order("sequence_no", { ascending: false }),
  ]);

  if (!saleResult.data && !saleResult.error) return { kind: "not_found" } as const;
  const auth = authSchema.safeParse(authResult.data);
  const sale = saleSchema.safeParse(saleResult.data);
  const state = currentStateSchema.safeParse(stateResult.data);
  const replacements = replacementsSchema.safeParse(replacementsResult.data);
  if (authResult.error || saleResult.error || stateResult.error || replacementsResult.error
    || !auth.success || !auth.data.user || !sale.success || !state.success || !replacements.success) {
    return { kind: "error" } as const;
  }

  let saleTest: SaleUnitTestSnapshot | null = null;
  if (sale.data.id_sale_test && ["admin", "owner"].includes(auth.data.user.app_metadata.role)) {
    const saleTestResult = await supabase
      .from("sale_unit_tests")
      .select("id_sale_test, id_unit, test_results, blocking_checks, location, tester_email, acknowledgement_text, confirmed_at")
      .eq("id_sale_test", sale.data.id_sale_test)
      .eq("id_unit", sale.data.id_unit)
      .single();
    const parsedSaleTest = saleUnitTestSnapshotSchema.safeParse(saleTestResult.data);
    if (saleTestResult.error || !parsedSaleTest.success) return { kind: "error" } as const;
    saleTest = parsedSaleTest.data;
  }

  const [originalUnitResult, customerResult, originalWarrantyResult] = await Promise.all([
    supabase.from("units").select("id_unit, brand, model, serial_number").eq("id_unit", sale.data.id_unit).single(),
    sale.data.id_customer
      ? supabase.from("customers").select("nama, kontak_wa").eq("id_customer", sale.data.id_customer).single()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("warranty").select("tanggal_berakhir").eq("id_unit", sale.data.id_unit).order("tanggal_mulai", { ascending: true }).limit(1).single(),
  ]);
  const originalUnit = unitSchema.safeParse(originalUnitResult.data);
  const customer = customerSchema.nullable().safeParse(customerResult.data);
  const originalWarranty = warrantySchema.safeParse(originalWarrantyResult.data);
  if (originalUnitResult.error || customerResult.error || originalWarrantyResult.error
    || !originalUnit.success || !customer.success || !originalWarranty.success) {
    return { kind: "error" } as const;
  }

  let currentUnit: z.infer<typeof unitSchema> | null = null;
  if (state.data) {
    const currentUnitResult = await supabase.from("units").select("id_unit, brand, model, serial_number").eq("id_unit", state.data.current_unit_id).single();
    const parsedCurrentUnit = unitSchema.safeParse(currentUnitResult.data);
    if (currentUnitResult.error || !parsedCurrentUnit.success) return { kind: "error" } as const;
    currentUnit = parsedCurrentUnit.data;
  }

  let claims: readonly ReplacementClaim[] = [];
  let candidates: readonly ReplacementCandidate[] = [];
  let accounts: readonly FinanceAccount[] = [];
  if (auth.data.user.app_metadata.role === "owner"
    && state.data?.current_warranty_status === "Aktif"
    && state.data.current_warranty_id) {
    const [claimsResult, candidatesResult, accountsResult] = await Promise.all([
      supabase.from("warranty_claim").select("id_klaim, tanggal, keluhan").eq("id_garansi", state.data.current_warranty_id).order("tanggal", { ascending: false }),
      supabase.from("units").select("id_unit, brand, model, status, harga_listing").in("status", ["Ready", "Listed"]).order("id_unit"),
      supabase.from("finance_accounts").select("id_account, nama").eq("is_active", true).order("nama"),
    ]);
    const parsedClaims = claimsSchema.safeParse(claimsResult.data);
    const parsedCandidates = candidatesSchema.safeParse(candidatesResult.data);
    const parsedAccounts = accountsSchema.safeParse(accountsResult.data);
    if (claimsResult.error || candidatesResult.error || accountsResult.error
      || !parsedClaims.success || !parsedCandidates.success || !parsedAccounts.success) {
      return { kind: "error" } as const;
    }
    const usedClaimIds = new Set(replacements.data.map((replacement) => replacement.id_klaim));
    claims = parsedClaims.data.filter((claim) => !usedClaimIds.has(claim.id_klaim));
    candidates = parsedCandidates.data;
    accounts = parsedAccounts.data;
  }

  return {
    kind: "ready",
    role: auth.data.user.app_metadata.role,
    sale: sale.data,
    state: state.data,
    originalUnit: originalUnit.data,
    currentUnit,
    customer: customer.data,
    originalWarranty: originalWarranty.data,
    saleTest,
    replacements: replacements.data,
    claims,
    candidates,
    accounts,
  } as const;
}
