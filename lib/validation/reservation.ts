import { z } from "zod";
import { saleUnitTestSchema } from "@/lib/validation/sales";

export const reservationIdSchema = z.string().uuid("Reservasi tidak valid.");

export const createReservationSchema = z
  .strictObject({
    idempotencyKey: z.string().uuid("Idempotency key tidak valid."),
    unitId: z.string().trim().min(1, "Unit wajib dipilih.").max(100),
    customerId: z.string().uuid("Customer tidak valid."),
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
  });

export const completeReservationSchema = z.strictObject({
  unitTest: saleUnitTestSchema,
  paymentMethod: z.enum(["Tunai", "Transfer"]),
  channel: z.enum(["Offline", "Marketplace", "Instagram", "TikTok", "WA"]),
  transactionDate: z.iso.date(),
  warrantyDays: z.coerce.number().int().positive("Durasi garansi wajib lebih dari 0 hari."),
});
