import { z } from "zod";

const amount = z.coerce.number().positive("Jumlah wajib lebih dari 0.");
const accountId = z.string().uuid("Akun tidak valid.");
const notes = z.string().trim().min(1, "Catatan wajib diisi.").max(500);
const sourceId = z.string().trim().min(1, "ID sumber wajib diisi.").max(100);

export const financeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("opex"), amount, accountId, notes, date: z.iso.date() }),
  z.object({ action: z.literal("capital"), amount, accountId, notes, date: z.iso.date() }),
  z.object({ action: z.literal("salePayment"), amount, accountId, sourceId, eventKey: z.string().uuid() }),
  z.object({ action: z.literal("servicePayment"), amount, accountId, sourceId, eventKey: z.string().uuid() }),
  z.object({ action: z.literal("reversal"), transactionId: z.string().uuid(), notes }),
  z.object({
    action: z.literal("return"),
    sourceType: z.enum(["Sales", "Servis"]),
    sourceId,
    amount,
    accountId,
    notes,
  }),
]);
