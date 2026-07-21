import { z } from "zod";

const details = {
  date: z.iso.date(),
  notes: z.string().trim().max(1000).transform((value) => value || null),
};

export const upgradeSchema = z.discriminatedUnion("type", [
  z.object({
    ...details,
    type: z.literal("part"),
    partId: z.string().trim().min(1).max(100),
  }),
  z.object({
    ...details,
    type: z.literal("service"),
    cost: z.coerce.number().min(0, "Biaya jasa tidak boleh negatif."),
  }),
  z.object({
    ...details,
    type: z.literal("downgrade"),
    cost: z.coerce.number().positive("Pengurangan modal wajib lebih dari 0."),
    currentSpecs: z.string().trim().min(1, "Spek setelah downgrade wajib diisi.").max(2000),
  }),
]);
