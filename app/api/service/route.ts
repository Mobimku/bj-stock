import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serviceOrderSchema } from "@/lib/validation/service";

const createdOrderSchema = z.object({ id_servis: z.string() });

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "teknisi", "owner"].includes(role)) {
      return NextResponse.json({ error: "Role tidak diizinkan membuat order servis." }, { status: 403 });
    }

    const input = serviceOrderSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input servis tidak valid." },
        { status: 400 },
      );
    }
    if (input.data.createWarrantyClaim && !["admin", "owner"].includes(role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat membuat servis klaim garansi." }, { status: 403 });
    }

    const { data, error } = await supabase
      .rpc("create_service_order", {
        p_id_unit: input.data.unitId,
        p_id_customer: input.data.customerId,
        p_customer_name: input.data.customerName,
        p_customer_wa: input.data.customerWa,
        p_customer_segment: input.data.customerSegment,
        p_customer_source: input.data.customerSource,
        p_jenis_servis: input.data.serviceType,
        p_brand_model: input.data.brandModel,
        p_keluhan: input.data.complaint,
        p_tanggal_masuk: input.data.entryDate,
        p_estimasi_selesai: input.data.estimatedCompletion,
        p_garansi_servis_hari: input.data.serviceWarrantyDays,
        p_create_claim: input.data.createWarrantyClaim,
      })
      .single();
    const order = createdOrderSchema.safeParse(data);

    if (error || !order.success) {
      const notFound = error?.code === "P0002";
      const invalid = error?.code === "P0001" || error?.code === "23505" || error?.code === "23514";
      return NextResponse.json(
        {
          error: notFound
            ? "Unit, customer, atau garansi tidak ditemukan."
            : invalid
              ? "Order servis tidak sesuai status unit atau masa garansi."
              : "Order servis gagal disimpan.",
        },
        { status: notFound ? 404 : invalid ? 400 : 500 },
      );
    }

    return NextResponse.json({ idService: order.data.id_servis }, { status: 201 });
  } catch (error) {
    console.error("POST /api/service failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
