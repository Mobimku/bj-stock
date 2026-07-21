import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  brand: z.string().min(1),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  initialSpecs: z.string().optional(),
  physicalCondition: z.enum(["A", "B", "C"]),
  functionalCondition: z.string().optional(),
  purchaseSource: z.string().optional(),
  initialCapital: z.number().positive(),
  entryDate: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat menambah unit." }, { status: 403 });
    }

    const raw = await request.json().catch(() => null);
    if (!raw) {
      return NextResponse.json({ error: "Format body tidak valid." }, { status: 400 });
    }

    const input = bodySchema.safeParse({
      ...raw,
      initialCapital: raw.initialCapital ? Number(raw.initialCapital) : undefined,
    });

    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input unit tidak valid." },
        { status: 400 },
      );
    }

    const { data: unit, error: createError } = await supabase
      .rpc("create_unit", {
        p_brand: input.data.brand,
        p_model: input.data.model ?? null,
        p_serial_number: input.data.serialNumber ?? null,
        p_spek_awal: input.data.initialSpecs ?? null,
        p_kondisi_fisik: input.data.physicalCondition,
        p_kondisi_fungsi: input.data.functionalCondition ?? null,
        p_sumber_beli: input.data.purchaseSource ?? null,
        p_modal_awal: input.data.initialCapital,
        p_tanggal_masuk: input.data.entryDate,
      })
      .single();

    const parsed = z.object({ id_unit: z.string() }).safeParse(unit);
    if (createError || !parsed.success) {
      const duplicate = createError?.code === "23505";
      return NextResponse.json(
        { error: duplicate ? "Serial number sudah terdaftar." : "Unit gagal disimpan." },
        { status: duplicate ? 400 : 500 },
      );
    }

    return NextResponse.json({ idUnit: parsed.data.id_unit }, { status: 201 });
  } catch (error) {
    console.error("POST /api/units failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}