import { z } from "zod";

const basePartSchema = z.object({
  partType: z.string().trim().min(1, "Jenis part wajib diisi.").max(100),
  condition: z.enum(["New", "Copotan"]),
  unitCost: z.coerce.number().min(0, "Modal part tidak boleh negatif."),
  source: z.string().trim().max(200).transform((value) => value || null),
});

export const createPartSchema = basePartSchema.extend({
  stockQuantity: z.coerce.number().int().min(0, "Stok tidak boleh negatif."),
});

export const updatePartSchema = basePartSchema.extend({
  stockAddition: z.coerce.number().int().min(0, "Restock tidak boleh negatif."),
});

export const bankPartSchema = z.object({
  id_part: z.string(),
  jenis_part: z.string(),
  kondisi: z.enum(["New", "Copotan"]).nullable(),
  stock_qty: z.number().int(),
  modal_per_unit: z.union([z.number(), z.string()]),
  sumber: z.string().nullable(),
});

export type BankPart = z.infer<typeof bankPartSchema>;
