import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { completeReservationSchema, reservationIdSchema } from "@/lib/validation/reservation";

const completedSchema = z.object({ id_invoice: z.string() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat menyelesaikan reservasi." }, { status: 403 });
    }

    const id = reservationIdSchema.safeParse((await params).id);
    const input = completeReservationSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) {
      return NextResponse.json(
        { error: id.error?.issues[0]?.message ?? input.error?.issues[0]?.message ?? "Input pelunasan tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("complete_reservation", {
      p_id_reservation: id.data,
      p_test: {
        test_results: input.data.unitTest.testResults,
        blocking_checks: input.data.unitTest.blockingChecks,
        location: input.data.unitTest.location,
        acknowledged: input.data.unitTest.acknowledged,
      },
      p_metode_bayar: input.data.paymentMethod,
      p_channel: input.data.channel,
      p_tanggal_transaksi: input.data.transactionDate,
      p_durasi_garansi_hari: input.data.warrantyDays,
    }).single();
    if (error) {
      const forbidden = /admin|owner/i.test(error.message);
      const status = forbidden ? 403 : error.code === "P0002" ? 404 :
        ["P0001", "23505", "23514", "22023"].includes(error.code ?? "") ? 400 : 500;
      return NextResponse.json(
        { error: status === 500 ? "Pelunasan reservasi gagal diproses." : error.message },
        { status },
      );
    }
    const completed = completedSchema.safeParse(data);
    if (!completed.success) {
      return NextResponse.json({ error: "Pelunasan reservasi gagal diproses." }, { status: 500 });
    }
    return NextResponse.json({ idInvoice: completed.data.id_invoice });
  } catch (error) {
    console.error("POST /api/reservations/[id]/complete failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
