import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serviceIdSchema } from "@/lib/validation/service";

const serviceQrSchema = z.object({ qr_payload: z.string().startsWith("/s/") });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }

    const id = serviceIdSchema.safeParse((await params).id.toUpperCase());
    if (!id.success) return NextResponse.json({ error: "ID servis tidak valid." }, { status: 400 });

    const { data, error } = await supabase
      .from("service_orders")
      .select("qr_payload")
      .eq("id_servis", id.data)
      .maybeSingle();
    const order = serviceQrSchema.safeParse(data);

    if (error) return NextResponse.json({ error: "QR servis gagal dibaca." }, { status: 500 });
    if (!order.success) return NextResponse.json({ error: "Order servis tidak ditemukan." }, { status: 404 });

    const publicUrl = new URL(order.data.qr_payload, request.url).toString();
    const png = await QRCode.toBuffer(publicUrl, {
      type: "png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${id.data}.png"`,
        "Content-Type": "image/png",
      },
    });
  } catch (error) {
    console.error("GET /api/service/[id]/qr failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
