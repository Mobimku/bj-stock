import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const unitQrSchema = z.object({ qr_payload: z.string().min(1) });

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

    const { id } = await params;
    const { data, error } = await supabase
      .from("units")
      .select("qr_payload")
      .eq("id_unit", id)
      .maybeSingle();
    const unit = unitQrSchema.safeParse(data);

    if (error) {
      return NextResponse.json({ error: "QR unit gagal dibaca." }, { status: 500 });
    }
    if (!unit.success) {
      return NextResponse.json({ error: "Unit tidak ditemukan." }, { status: 404 });
    }

    const png = await QRCode.toBuffer(unit.data.qr_payload, {
      type: "png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${id}.png"`,
        "Content-Type": "image/png",
      },
    });
  } catch (error) {
    console.error("GET /api/units/[id]/qr failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
