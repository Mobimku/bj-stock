import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPartSchema } from "@/lib/validation/bank-stock";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat menambah part." }, { status: 403 });
    }

    const input = createPartSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input part tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .rpc("create_bank_part", {
        p_jenis_part: input.data.partType,
        p_kondisi: input.data.condition,
        p_stock_qty: input.data.stockQuantity,
        p_modal_per_unit: input.data.unitCost,
        p_sumber: input.data.source,
      })
      .single();

    if (error) {
      return NextResponse.json({ error: "Part gagal disimpan." }, { status: 500 });
    }

    return NextResponse.json({ part: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/bank-stock failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
