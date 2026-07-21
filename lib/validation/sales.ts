import { z } from "zod";
import { optionalWhatsappSchema } from "@/lib/validation/whatsapp";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null);

export const SALE_TEST_CATEGORY_KEYS = [
  "identity_spec_serial",
  "physical_casing_hinges",
  "display_dead_pixels",
  "keyboard_touchpad",
  "wifi_bluetooth",
  "av_devices",
  "usb_ports",
  "display_output",
  "battery_charging_charger",
  "storage_health",
  "boot_os_locks",
  "included_accessories",
] as const;

export const SALE_TEST_BLOCKER_KEYS = [
  "identity_mismatch",
  "serial_mismatch",
  "spec_mismatch",
  "swollen_battery",
  "bios_lock",
  "mdm_lock",
  "unsafe_charger",
] as const;

export const SALE_TEST_RESULT_STATUSES = ["Lulus", "Ada Catatan", "Tidak Diuji"] as const;

const saleTestResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("Lulus"),
    note: z.string().trim().max(160, "Catatan maksimal 160 karakter.").nullable().optional(),
  }),
  z.strictObject({
    status: z.enum(["Ada Catatan", "Tidak Diuji"]),
    note: z
      .string()
      .trim()
      .min(1, "Catatan wajib diisi untuk hasil selain Lulus.")
      .max(160, "Catatan maksimal 160 karakter."),
  }),
]);

const saleTestResultsSchema = z.strictObject({
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
});

const saleBlockingChecksSchema = z.strictObject({
  identity_mismatch: z.literal(false, { error: "Identitas unit tidak boleh mismatch." }),
  serial_mismatch: z.literal(false, { error: "Serial unit tidak boleh mismatch." }),
  spec_mismatch: z.literal(false, { error: "Spesifikasi unit tidak boleh mismatch." }),
  swollen_battery: z.literal(false, { error: "Baterai menggelembung memblokir penjualan." }),
  bios_lock: z.literal(false, { error: "BIOS lock memblokir penjualan." }),
  mdm_lock: z.literal(false, { error: "MDM lock memblokir penjualan." }),
  unsafe_charger: z.literal(false, { error: "Charger tidak aman memblokir penjualan." }),
});

export const saleUnitTestSchema = z.strictObject({
  testResults: saleTestResultsSchema,
  blockingChecks: saleBlockingChecksSchema,
  location: z.string().trim().min(1, "Lokasi pengujian wajib diisi.").max(120),
  acknowledged: z.literal(true, { error: "Persetujuan pembeli wajib dicentang." }),
});

export const saleSchema = z
  .strictObject({
    unitId: z.string().trim().min(1).max(100),
    customerId: z
      .string()
      .trim()
      .refine((value) => !value || z.string().uuid().safeParse(value).success, "Customer tidak valid.")
      .transform((value) => value || null),
    customerName: optionalText(100),
    customerWa: optionalWhatsappSchema,
    customerSegment: z
      .union([z.enum(["Pelajar", "Orang Tua", "Remote Worker", "Lainnya"]), z.literal("")])
      .transform((value) => value || null),
    customerSource: z
      .union([z.enum(["TikTok", "Reels", "Instagram", "Facebook Marketplace", "WA", "Referral", "Lainnya"]), z.literal("")])
      .transform((value) => value || null),
    salePrice: z.coerce.number().positive("Harga jual wajib lebih dari 0."),
    channel: z.enum(["Offline", "Marketplace", "Instagram", "TikTok", "WA"]),
    paymentMethod: z.enum(["Tunai", "Transfer", "Cicilan"]),
    transactionDate: z.iso.date(),
    warrantyDays: z.coerce.number().int().positive("Durasi garansi wajib lebih dari 0 hari."),
    unitTest: saleUnitTestSchema,
  })
  .refine((input) => input.customerId || input.customerName, {
    message: "Pilih customer atau isi nama customer baru.",
    path: ["customerName"],
  });

export const warrantyClaimSchema = z.object({
  unitId: z.string().trim().min(1, "Keluhan wajib diisi.").max(100),
  date: z.iso.date(),
  complaint: z.string().trim().min(1, "Keluhan wajib diisi.").max(2000),
  action: optionalText(2000),
  cost: z.coerce.number().min(0, "Biaya tidak boleh negatif."),
});

export const warrantyReplacementSchema = z.object({
  idempotencyKey: z.string().uuid(),
  claimId: z.string().uuid(),
  replacementUnitId: z.string().trim().min(1, "Unit pengganti wajib diisi.").max(100),
  replacementValue: z.coerce.number().positive("Nilai transaksi unit pengganti wajib lebih dari 0."),
  replacementDate: z.iso.date(),
  reason: z.string().trim().min(1, "Alasan penggantian wajib diisi.").max(2000),
  accountId: z.string().uuid().nullable().optional(),
});
