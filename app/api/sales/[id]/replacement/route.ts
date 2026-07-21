import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { warrantyReplacementSchema } from "@/lib/validation/sales";
import { z } from "zod";

const conflictMessages = new Set([
  "Idempotency key sudah digunakan dengan payload berbeda",
  "Invoice sudah diretur atau dibatalkan",
  "Klaim garansi sudah digunakan",
  "Unit aktif harus berstatus Terjual",
  "Unit pengganti harus berstatus Ready atau Listed",
  "Garansi tidak aktif pada tanggal penggantian",
  "Order servis klaim sudah ditutup",
  "Akun Finance tidak aktif atau tidak ditemukan",
]);
const invalidMessages = new Set([
  "Idempotency key wajib diisi",
  "Invoice wajib diisi",
  "Klaim garansi wajib diisi",
  "Unit pengganti wajib diisi",
  "Nilai transaksi unit pengganti wajib lebih dari 0",
  "Tanggal penggantian wajib diisi",
  "Alasan penggantian wajib diisi",
  "Unit pengganti harus berbeda dari unit aktif",
  "Klaim garansi tidak sesuai dengan garansi unit aktif",
  "Order servis klaim tidak sesuai dengan unit aktif",
  "Order servis klaim wajib memiliki diagnosis sebelum penggantian",
  "Penggantian tanpa selisih tidak boleh memakai akun Finance",
  "Akun Finance wajib untuk penggantian dengan selisih",
]);

function classifyBusinessError(error: { readonly code: string; readonly message: string }) {
  if (error.code === "P0002") {
    return { status: 404, message: "Invoice, unit, garansi, atau klaim tidak ditemukan." } as const;
  }
  if (error.code === "23505") {
    return { status: 409, message: "Penggantian unit sudah diproses atau berbenturan dengan perubahan lain." } as const;
  }
  if (error.code === "23514") {
    return { status: 400, message: "Data penggantian tidak memenuhi aturan bisnis." } as const;
  }
  if (error.code === "P0001" && conflictMessages.has(error.message)) {
    return { status: 409, message: error.message } as const;
  }
  if (error.code === "P0001" && invalidMessages.has(error.message)) {
    return { status: 400, message: error.message } as const;
  }
  return null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (role !== "owner") {
      return NextResponse.json({ error: "Hanya Owner yang dapat melakukan penggantian unit." }, { status: 403 });
    }

    const idInvoice = (await params).id.toUpperCase();

    const body = await _request.json().catch(() => null);
    const input = warrantyReplacementSchema.safeParse(body);

    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input penggantian tidak valid." },
        { status: 400 },
      );
    }

    const replacementUnitId = input.data.replacementUnitId.toUpperCase();

    const { data, error } = await supabase
      .rpc("replace_warranty_unit", {
        p_idempotency_key: input.data.idempotencyKey,
        p_id_invoice: idInvoice,
        p_id_klaim: input.data.claimId,
        p_replacement_unit_id: replacementUnitId,
        p_replacement_transaction_value: input.data.replacementValue,
        p_replacement_date: input.data.replacementDate,
        p_reason: input.data.reason,
        p_id_account: input.data.accountId ?? null,
      })
      .single();

    if (error) {
      const businessError = classifyBusinessError(error);
      if (businessError) {
        return NextResponse.json({ error: businessError.message }, { status: businessError.status });
      }
      console.error("POST /api/sales/[id]/replacement unexpected RPC error", error);
      return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
    }
    if (!data) {
      console.error("POST /api/sales/[id]/replacement returned no data", { idInvoice });
      return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
    }

    // ponytail: one-caller response verifier, kept inline
    const responseSchema = z.object({
      id_replacement: z.string(),
      idempotency_key: z.string(),
      id_invoice: z.string(),
      sequence_no: z.number(),
      id_klaim: z.string(),
      old_unit_id: z.string(),
      replacement_unit_id: z.string(),
      old_warranty_id: z.string(),
      new_warranty_id: z.string(),
      replacement_date: z.string(),
      grace_days: z.number(),
      previous_transaction_value: z.coerce.number(),
      replacement_transaction_value: z.coerce.number(),
      price_difference: z.coerce.number(),
      replacement_unit_modal: z.coerce.number(),
      adjusted_margin: z.coerce.number(),
      id_account: z.string().nullable(),
      id_finance_transaction: z.string().nullable(),
      reason: z.string(),
      created_by: z.string().nullable(),
      created_at: z.string(),
    });

    const parsed = responseSchema.parse(data);

    return NextResponse.json({ replacement: parsed }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales/[id]/replacement failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
