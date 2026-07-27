import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reservationIdSchema } from "@/lib/validation/reservation";

const resolvedSchema = z.object({ status: z.literal("Hangus") });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat menghanguskan DP." }, { status: 403 });
    }
    const id = reservationIdSchema.safeParse((await params).id);
    if (!id.success) {
      return NextResponse.json({ error: id.error.issues[0]?.message }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("forfeit_reservation", {
      p_id_reservation: id.data,
    }).single();
    if (error) {
      const status = error.code === "P0002" ? 404 :
        ["P0001", "23514", "22023"].includes(error.code ?? "") ? 400 : 500;
      return NextResponse.json(
        { error: status === 500 ? "Penghangusan DP gagal diproses." : error.message },
        { status },
      );
    }
    if (!resolvedSchema.safeParse(data).success) {
      return NextResponse.json({ error: "Penghangusan DP gagal diproses." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/reservations/[id]/forfeit failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
