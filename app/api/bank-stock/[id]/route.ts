import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updatePartSchema } from "@/lib/validation/bank-stock";

const idSchema = z.string().min(1).max(100);

async function getAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await getAdmin();
    if (!user) return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    if (!["admin", "owner"].includes(user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin yang dapat mengubah part." }, { status: 403 });
    }

    const id = idSchema.safeParse((await params).id);
    const input = updatePartSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) {
      return NextResponse.json(
        { error: input.success ? "ID part tidak valid." : input.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .rpc("update_bank_part", {
        p_id_part: id.data,
        p_jenis_part: input.data.partType,
        p_kondisi: input.data.condition,
        p_stock_addition: input.data.stockAddition,
        p_modal_per_unit: input.data.unitCost,
        p_sumber: input.data.source,
      })
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.code === "P0002" ? "Part tidak ditemukan." : "Part gagal diperbarui." },
        { status: error.code === "P0002" ? 404 : 500 },
      );
    }
    return NextResponse.json({ part: data });
  } catch (error) {
    console.error("PATCH /api/bank-stock/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await getAdmin();
    if (!user) return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    if (!["admin", "owner"].includes(user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin yang dapat menghapus part." }, { status: 403 });
    }

    const id = idSchema.safeParse((await params).id);
    if (!id.success) {
      return NextResponse.json({ error: "ID part tidak valid." }, { status: 400 });
    }

    const { error, count } = await supabase
      .from("bank_stock")
      .delete({ count: "exact" })
      .eq("id_part", id.data);

    if (error) {
      return NextResponse.json(
        { error: error.code === "23503" ? "Part sudah dipakai dan tidak dapat dihapus." : "Part gagal dihapus." },
        { status: error.code === "23503" ? 400 : 500 },
      );
    }
    if (!count) return NextResponse.json({ error: "Part tidak ditemukan." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/bank-stock/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
