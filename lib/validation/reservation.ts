import { z } from "zod";
import { saleUnitTestSchema } from "@/lib/validation/sales";
import { optionalWhatsappSchema } from "@/lib/validation/whatsapp";

export const reservationIdSchema = z.string().uuid("Reservasi tidak valid.");

const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const createReservationSchema = z
  .strictObject({
    idempotencyKey: z.string().uuid("Idempotency key tidak valid."),
    unitId: z.string().trim().min(1, "Unit wajib dipilih.").max(100),
    customerId: z.preprocess(
      blankToNull,
      z.string().uuid("Customer tidak valid.").nullable().optional(),
    ),
    customerName: z.preprocess(
      blankToNull,
      z.string().trim().min(1).max(100).nullable().optional(),
    ),
    customerWa: z.preprocess(
      blankToNull,
      optionalWhatsappSchema.nullable().optional(),
    ),
    customerSegment: z.preprocess(
      blankToNull,
      z.enum(["Pelajar", "Orang Tua", "Remote Worker", "Lainnya"]).nullable().optional(),
    ),
    customerSource: z.preprocess(
      blankToNull,
      z.enum([
        "TikTok", "Reels", "Instagram", "Facebook Marketplace", "WA", "Referral", "Lainnya",
      ]).nullable().optional(),
    ),
    dpAmount: z.coerce.number().positive("DP wajib lebih dari 0."),
    agreedPrice: z.coerce.number().positive("Harga kesepakatan wajib lebih dari 0."),
    isRefundable: z.boolean(),
    expiresAt: z.iso
      .datetime({ offset: true })
      .refine((value) => new Date(value).getTime() > Date.now(), "Batas reservasi harus di masa depan."),
  })
  .refine((value) => value.dpAmount < value.agreedPrice, {
    message: "DP harus lebih kecil dari harga kesepakatan.",
    path: ["dpAmount"],
  })
  .superRefine((value, context) => {
    const hasExistingCustomer = value.customerId != null;
    const hasNewCustomer = Boolean(value.customerName?.trim());
    if (hasExistingCustomer === hasNewCustomer) {
      context.addIssue({
        code: "custom",
        message: "Pilih customer existing atau isi nama customer baru, tepat salah satu.",
        path: ["customerId"],
      });
    }
    if (hasExistingCustomer && (value.customerWa != null || value.customerSegment != null || value.customerSource != null)) {
      context.addIssue({
        code: "custom",
        message: "Data customer baru tidak boleh dikirim untuk customer existing.",
        path: ["customerId"],
      });
    }
  });

export const completeReservationSchema = z.strictObject({
  unitTest: saleUnitTestSchema,
  paymentMethod: z.enum(["Tunai", "Transfer"]),
  channel: z.enum(["Offline", "Marketplace", "Instagram", "TikTok", "WA"]),
  transactionDate: z.iso.date(),
  warrantyDays: z.coerce.number().int().positive("Durasi garansi wajib lebih dari 0 hari."),
});
