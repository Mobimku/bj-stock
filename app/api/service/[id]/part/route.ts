import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceIdSchema, servicePartSchema } from "@/lib/validation/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "teknisi", "owner"].includes(role)) {
      return NextResponse.json({ error: "Role tidak diizinkan menambah part servis." }, { status: 403 });
    }

    const id = serviceIdSchema.safeParse((await params).id.toUpperCase());
    const input = servicePartSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) {
      return NextResponse.json(
        { error: !id.success ? "ID servis tidak valid." : !input.success ? input.error.issues[0]?.message : "Input part tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .rpc("add_service_part", {
        p_id_servis: id.data,
        p_id_part: input.data.partId,
        p_tanggal: input.data.date,
      })
      .single();

    if (error || !data) {
      const notFound = error?.code === "P0002" || error?.code === "23503";
      const invalid = error?.code === "P0001" || error?.code === "23514";
      return NextResponse.json(
        {
          error: notFound
            ? "Order servis atau part tidak ditemukan."
            : invalid
              ? "Part habis atau servis tidak sedang dikerjakan."
              : "Part servis gagal disimpan.",
        },
        { status: notFound ? 404 : invalid ? 400 : 500 },
      );
    }

    return NextResponse.json({ part: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/service/[id]/part failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
