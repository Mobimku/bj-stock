import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { financeActionSchema } from "@/lib/validation/finance";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (authData.user.app_metadata.role !== "admin" && authData.user.app_metadata.role !== "owner") {
      return NextResponse.json({ error: "Hanya admin/owner yang dapat mengakses Finance." }, { status: 403 });
    }

    const input = financeActionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input Finance tidak valid." },
        { status: 400 },
      );
    }

    const value = input.data;
    let rpcError: { code?: string; message: string } | null = null;
    switch (value.action) {
      case "opex":
        rpcError = (await supabase.rpc("record_opex", {
          p_jumlah: value.amount,
          p_catatan: value.notes,
          p_tanggal: value.date,
          p_id_account: value.accountId,
        })).error;
        break;
      case "capital":
        rpcError = (await supabase.rpc("record_modal_disetor", {
          p_jumlah: value.amount,
          p_catatan: value.notes,
          p_tanggal: value.date,
          p_id_account: value.accountId,
        })).error;
        break;
      case "salePayment":
        rpcError = (await supabase.rpc("record_sale_payment", {
          p_id_invoice: value.sourceId,
          p_jumlah: value.amount,
          p_event_key: value.eventKey,
          p_id_account: value.accountId,
        })).error;
        break;
      case "servicePayment":
        rpcError = (await supabase.rpc("record_service_payment", {
          p_id_servis: value.sourceId,
          p_jumlah: value.amount,
          p_event_key: value.eventKey,
          p_id_account: value.accountId,
        })).error;
        break;
      case "reversal":
        rpcError = (await supabase.rpc("reverse_transaction", {
          p_id_transaksi: value.transactionId,
          p_catatan: value.notes,
        })).error;
        break;
      case "return":
        rpcError = (await supabase.rpc("process_return", {
          p_source_type: value.sourceType,
          p_source_id: value.sourceId,
          p_alasan: value.notes,
          p_jumlah_refund: value.amount,
          p_id_account: value.accountId,
        })).error;
        break;
    }

    if (rpcError) {
      const status = rpcError.code === "P0002" ? 404 : 400;
      return NextResponse.json({ error: rpcError.message }, { status });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/finance failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
