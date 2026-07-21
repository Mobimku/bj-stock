import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { upgradeSchema } from "@/lib/validation/upgrade";

const idSchema = z.string().min(1).max(100);
const removePartSchema = z.strictObject({ logId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "teknisi", "owner"].includes(role)) {
      return NextResponse.json({ error: "Role tidak diizinkan menambah upgrade." }, { status: 403 });
    }

    const id = idSchema.safeParse((await params).id);
    const input = upgradeSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) {
      return NextResponse.json(
        { error: input.success ? "ID unit tidak valid." : input.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const result = input.data.type === "downgrade"
      ? await supabase.rpc("add_unit_downgrade", {
          p_id_unit: id.data,
          p_biaya: input.data.cost,
          p_spek_setelah: input.data.currentSpecs,
          p_tanggal: input.data.date,
          p_catatan: input.data.notes,
        }).single()
      : await supabase.rpc("add_unit_upgrade", {
          p_id_unit: id.data,
          p_id_part: input.data.type === "part" ? input.data.partId : null,
          p_biaya: input.data.type === "service" ? input.data.cost : 0,
          p_tanggal: input.data.date,
          p_catatan: input.data.notes,
        }).single();
    const { data, error } = result;

    if (error) {
      const invalid = ["P0001", "23503", "23514"].includes(error.code);
      return NextResponse.json(
        {
          error: invalid
            ? input.data.type === "downgrade"
              ? error.message
              : "Part habis, tidak ditemukan, atau unit tidak valid."
            : "Upgrade Log gagal disimpan.",
        },
        { status: invalid ? 400 : 500 },
      );
    }

    return NextResponse.json({ upgrade: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/units/[id]/upgrade failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "teknisi", "owner"].includes(role)) {
      return NextResponse.json({ error: "Role tidak diizinkan melepas part." }, { status: 403 });
    }

    const id = idSchema.safeParse((await params).id);
    const input = removePartSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) {
      return NextResponse.json({ error: "Unit atau upgrade log tidak valid." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("upgrade_log")
      .delete()
      .eq("id_unit", id.data)
      .eq("id_log", input.data.logId)
      .eq("jenis", "part")
      .not("id_part", "is", null)
      .select("id_log, id_part, biaya")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Part gagal dilepas dari unit." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Upgrade part tidak ditemukan atau sudah dilepas." }, { status: 404 });
    }

    return NextResponse.json({ downgrade: data });
  } catch (error) {
    console.error("DELETE /api/units/[id]/upgrade failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
