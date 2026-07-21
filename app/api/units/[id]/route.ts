import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { unitDetailSchema, upgradeHistorySchema } from "@/lib/validation/unit";

const idSchema = z.string().min(1).max(100);

const editSchema = z.object({
  brand: z.string().trim().min(1, "Brand wajib diisi.").max(50).optional(),
  model: z.string().trim().max(100).transform((v) => v || null).optional(),
  spek_saat_ini: z.string().trim().max(2000).transform((v) => v || null).optional(),
  kondisi_fisik: z.enum(["A", "B", "C"]).optional(),
  kondisi_fungsi: z.string().trim().max(2000).transform((v) => v || null).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }

    const parsedId = idSchema.safeParse((await params).id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "ID unit tidak valid." }, { status: 400 });
    }

    const [unitResult, historyResult] = await Promise.all([
      supabase.from("units").select("*").eq("id_unit", parsedId.data).maybeSingle(),
      supabase
        .from("upgrade_log")
        .select("id_log, id_part, jenis, biaya, spek_setelah, tanggal, catatan")
        .eq("id_unit", parsedId.data)
        .order("tanggal", { ascending: false }),
    ]);

    if (unitResult.error || historyResult.error) {
      return NextResponse.json({ error: "Detail unit gagal dimuat." }, { status: 500 });
    }
    if (!unitResult.data) {
      return NextResponse.json({ error: "Unit tidak ditemukan." }, { status: 404 });
    }

    const unit = unitDetailSchema.safeParse(unitResult.data);
    const upgrades = upgradeHistorySchema.safeParse(historyResult.data);
    if (!unit.success || !upgrades.success) {
      return NextResponse.json({ error: "Format data unit tidak valid." }, { status: 500 });
    }

    return NextResponse.json({ unit: unit.data, upgrades: upgrades.data });
  } catch (error) {
    console.error("GET /api/units/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function PATCH(
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
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat mengedit unit." }, { status: 403 });
    }

    const parsedId = idSchema.safeParse((await params).id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "ID unit tidak valid." }, { status: 400 });
    }

    const input = editSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        {
          error:
            input.error.issues[0]?.message ??
            "Input tidak valid. Field yang boleh diubah: brand, model, spek_saat_ini, kondisi_fisik, kondisi_fungsi.",
        },
        { status: 400 },
      );
    }

    const updates = Object.fromEntries(
      Object.entries(input.data).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
    }

    // id_unit never changes — typo fix brand/model only updates display fields.
    const { data: before } = await supabase
      .from("units")
      .select("brand, model")
      .eq("id_unit", parsedId.data)
      .maybeSingle();

    const { data, error } = await supabase
      .from("units")
      .update(updates)
      .eq("id_unit", parsedId.data)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Serial number sudah dipakai unit lain." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Unit tidak ditemukan." }, { status: 404 });
    }

    if (
      before &&
      (("brand" in updates && before.brand !== updates.brand) ||
        ("model" in updates && before.model !== updates.model))
    ) {
      await supabase.rpc("log_admin_action", {
        p_aksi: "edit_unit_identity",
        p_target: parsedId.data,
        p_detail: {
          before: { brand: before.brand, model: before.model },
          after: { brand: data.brand, model: data.model },
          by: authData.user.id,
        },
      });
    }

    return NextResponse.json({ unit: data });
  } catch (error) {
    console.error("PATCH /api/units/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
