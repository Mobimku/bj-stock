import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const delistSchema = z.object({
  alasan: z.string().trim().min(1, "Alasan delist wajib diisi.").max(500),
  jenis: z.enum(["rusak", "retur_supplier", "salah_input", "hilang"]),
});

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
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat delist unit." }, { status: 403 });
    }

    const { id } = await params;
    const input = delistSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input tidak valid." },
        { status: 400 },
      );
    }

    const { error } = await supabase.rpc("delist_unit", {
      p_id_unit: id,
      p_alasan: input.data.alasan,
      p_jenis: input.data.jenis,
    });

    if (error) {
      const status = error.code === "P0002" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/units/[id]/delist failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
