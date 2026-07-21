import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json(
        { error: "Sesi login diperlukan." },
        { status: 401 },
      );
    }
    if (role !== "owner") {
      return NextResponse.json(
        { error: "Hanya Owner yang dapat membatalkan transaksi penjualan." },
        { status: 403 },
      );
    }

    const idInvoice = (await params).id.toUpperCase();

    const { error } = await supabase.rpc("cancel_sale", {
      p_id_invoice: idInvoice,
      p_alasan: "Pembatalan invoice oleh Owner",
    });

    if (error) {
      const status =
        error.code === "P0002" ? 404 : error.code === "P0001" ? 400 : 500;
      const message =
        status === 500 ? "Pembatalan transaksi gagal diproses." : error.message;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/sales/[id]/cancel failed", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 },
    );
  }
}
