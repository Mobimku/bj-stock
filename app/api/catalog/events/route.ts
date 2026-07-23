import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const trafficSourceSchema = z
  .string()
  .trim()
  .max(48)
  .regex(/^[a-z0-9][a-z0-9._:-]{0,47}$/)
  .optional();

const catalogEventSchema = z.discriminatedUnion("eventType", [
  z
    .object({
      eventType: z.literal("catalog_view"),
      sessionId: z.string().uuid(),
      trafficSource: trafficSourceSchema,
    })
    .strict(),
  z
    .object({
      eventType: z.literal("detail_view"),
      sessionId: z.string().uuid(),
      idUnit: z.string().min(1),
      trafficSource: trafficSourceSchema,
    })
    .strict(),
  z
    .object({
      eventType: z.literal("whatsapp_click"),
      sessionId: z.string().uuid(),
      idUnit: z.string().min(1),
      trafficSource: trafficSourceSchema,
    })
    .strict(),
  z
    .object({
      eventType: z.literal("share_click"),
      sessionId: z.string().uuid(),
      idUnit: z.string().min(1),
      trafficSource: trafficSourceSchema,
    })
    .strict(),
]);

export async function POST(request: Request) {
  try {
    const input = catalogEventSchema.safeParse(await request.json());
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Event katalog tidak valid." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("record_catalog_event", {
      p_event_type: input.data.eventType,
      p_session_id: input.data.sessionId,
      p_id_unit: input.data.eventType === "catalog_view" ? null : input.data.idUnit,
      p_traffic_source: input.data.trafficSource ?? null,
    });

    if (error) {
      return NextResponse.json({ error: "Event katalog gagal dicatat." }, { status: 500 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Format body tidak valid." }, { status: 400 });
    }
    console.error("POST /api/catalog/events failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
