import { z } from "zod";
import { todayInJakarta } from "@/lib/format";
import { optionalWhatsappSchema } from "@/lib/validation/whatsapp";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null);
const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .transform((value) => value || null);

export const serviceOrderSchema = z
  .object({
    unitId: z.string().trim().max(100).transform((value) => value || null),
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
    serviceType: z.enum(["Repair", "Install", "Cleaning"]),
    brandModel: optionalText(200),
    complaint: z.string().trim().min(1, "Keluhan wajib diisi.").max(2000),
    entryDate: z.iso.date(),
    estimatedCompletion: optionalDate,
    serviceWarrantyDays: z.coerce.number().int().min(1).max(365),
    createWarrantyClaim: z.boolean(),
  })
  .superRefine((input, context) => {
    if (!input.customerId && !input.customerName) {
      context.addIssue({ code: "custom", message: "Pilih customer atau isi customer baru.", path: ["customerName"] });
    }
    if (!input.unitId && !input.brandModel) {
      context.addIssue({ code: "custom", message: "Brand/model wajib diisi untuk servis customer luar.", path: ["brandModel"] });
    }
    if (!input.unitId && input.createWarrantyClaim) {
      context.addIssue({ code: "custom", message: "Servis customer luar tidak dapat menjadi klaim garansi.", path: ["createWarrantyClaim"] });
    }
    if (input.estimatedCompletion && input.estimatedCompletion < input.entryDate) {
      context.addIssue({ code: "custom", message: "Estimasi selesai tidak boleh sebelum tanggal masuk.", path: ["estimatedCompletion"] });
    }
    if (input.entryDate > todayInJakarta()) {
      context.addIssue({ code: "custom", message: "Tanggal masuk tidak boleh di masa depan.", path: ["entryDate"] });
    }
  });

export const serviceStatusSchema = z.object({
  targetStatus: z.enum(["Diagnosa", "Dikerjakan", "Selesai", "Diambil"]),
  diagnosis: optionalText(2000),
  action: optionalText(2000),
  serviceFee: z.union([z.coerce.number().min(0), z.null()]),
  estimatedCompletion: optionalDate,
});

export const servicePartSchema = z.object({
  partId: z.string().trim().min(1).max(100),
  date: z.iso.date(),
});

export const serviceIdSchema = z.string().regex(/^SVC-\d{4}-\d{3}$/, "ID servis tidak valid.");
