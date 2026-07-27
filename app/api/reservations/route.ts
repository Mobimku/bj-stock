import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createReservationSchema } from "@/lib/validation/reservation";

const reservationSchema = z.object({ id_reservation: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat membuat reservasi." }, { status: 403 });
    }

    const input = createReservationSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input reservasi tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("create_reservation", {
      p_idempotency_key: input.data.idempotencyKey,
      p_id_unit: input.data.unitId,
      p_id_customer: input.data.customerId ?? null,
      p_customer_name: input.data.customerName ?? null,
      p_customer_wa: input.data.customerWa ?? null,
      p_customer_segment: input.data.customerSegment ?? null,
      p_customer_source: input.data.customerSource ?? null,
      p_dp_amount: input.data.dpAmount,
      p_agreed_price: input.data.agreedPrice,
      p_is_refundable: input.data.isRefundable,
      p_expires_at: input.data.expiresAt,
    }).single();
    if (error) {
      const status = error.code === "P0002" ? 404 : error.code === "23505" ? 409 :
        ["P0001", "23514", "22023"].includes(error.code ?? "") ? 400 : 500;
      return NextResponse.json(
        { error: status === 500 ? "Reservasi gagal disimpan." : error.message },
        { status },
      );
    }
    const reservation = reservationSchema.safeParse(data);
    if (!reservation.success) {
      return NextResponse.json({ error: "Reservasi gagal disimpan." }, { status: 500 });
    }
    return NextResponse.json({ idReservation: reservation.data.id_reservation }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reservations failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
