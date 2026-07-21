import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { warrantyClaimSchema } from "@/lib/validation/sales";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat mencatat klaim." }, { status: 403 });
    }

    const input = warrantyClaimSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input klaim tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .rpc("create_warranty_claim", {
        p_id_unit: input.data.unitId,
        p_tanggal: input.data.date,
        p_keluhan: input.data.complaint,
        p_tindakan: input.data.action,
        p_biaya: input.data.cost,
      })
      .single();

    if (error || !data) {
      const notFound = error?.code === "P0002";
      const expired = error?.code === "P0001";
      return NextResponse.json(
        {
          error: notFound
            ? "Garansi tidak ditemukan."
            : expired
              ? "Garansi sudah habis dan tidak dapat diklaim."
              : "Klaim gagal disimpan.",
        },
        { status: notFound ? 404 : expired ? 400 : 500 },
      );
    }

    return NextResponse.json({ claim: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/warranty/claim failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
