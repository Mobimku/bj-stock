import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceIdSchema, serviceStatusSchema } from "@/lib/validation/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "teknisi", "owner"].includes(role)) {
      return NextResponse.json({ error: "Role tidak diizinkan melihat servis." }, { status: 403 });
    }

    const id = serviceIdSchema.safeParse((await params).id.toUpperCase());
    if (!id.success) {
      return NextResponse.json({ error: id.error.issues[0]?.message }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("service_orders")
      .select("id_servis, status")
      .eq("id_servis", id.data)
      .maybeSingle();

    if (error) return NextResponse.json({ error: "Order servis gagal diperiksa." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Order servis tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ service: data });
  } catch (error) {
    console.error("GET /api/service/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "teknisi", "owner"].includes(role)) {
      return NextResponse.json({ error: "Role tidak diizinkan mengubah servis." }, { status: 403 });
    }

    const id = serviceIdSchema.safeParse((await params).id.toUpperCase());
    const input = serviceStatusSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) {
      return NextResponse.json(
        { error: !id.success ? "ID servis tidak valid." : !input.success ? input.error.issues[0]?.message : "Input status tidak valid." },
        { status: 400 },
      );
    }
    if (input.data.targetStatus === "Diambil" && !["admin", "owner"].includes(role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat menyerahkan unit servis." }, { status: 403 });
    }

    const { data, error } = await supabase
      .rpc("update_service_status", {
        p_id_servis: id.data,
        p_target_status: input.data.targetStatus,
        p_diagnosa: input.data.diagnosis,
        p_tindakan: input.data.action,
        p_biaya_jasa: input.data.serviceFee,
        p_estimasi_selesai: input.data.estimatedCompletion,
      })
      .single();

    if (error || !data) {
      const notFound = error?.code === "P0002";
      const invalid = error?.code === "P0001" || error?.code === "23514";
      return NextResponse.json(
        {
          error: notFound
            ? "Order servis tidak ditemukan."
            : invalid
              ? "Status harus berurutan dan data tahap wajib diisi."
              : "Status servis gagal diperbarui.",
        },
        { status: notFound ? 404 : invalid ? 400 : 500 },
      );
    }

    return NextResponse.json({ service: data });
  } catch (error) {
    console.error("PATCH /api/service/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
