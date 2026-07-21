import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    if (role !== "owner") return NextResponse.json({ error: "Hanya Owner yang dapat membatalkan service order." }, { status: 403 });

    const idServis = (await params).id.toUpperCase();
    const admin = await createAdminClient();

    // 1. Validate
    const { data: svc, error: svcErr } = await admin
      .from("service_orders")
      .select("id_servis, status")
      .eq("id_servis", idServis)
      .maybeSingle();

    if (svcErr || !svc) return NextResponse.json({ error: "Service order tidak ditemukan." }, { status: 404 });
    if (svc.status === "Diambil") return NextResponse.json({ error: "Service sudah selesai/diambil. Gunakan Retur untuk pembatalan." }, { status: 400 });

    // 2. Return parts to bank stock (direct update, bypass RLS)
    const { data: partLogs } = await admin
      .from("service_part_log")
      .select("id_part")
      .eq("id_servis", idServis);

    for (const log of partLogs ?? []) {
      try {
        await admin.rpc("increment_bank_stock_unsafe", { p_id_part: log.id_part });
      } catch {
        const { data: part } = await admin.from("bank_stock").select("stock_qty").eq("id_part", log.id_part).single();
        if (part) {
          await admin.from("bank_stock").update({ stock_qty: (part.stock_qty ?? 0) + 1 }).eq("id_part", log.id_part);
        }
      }
    }

    // 3. Delete part logs
    await admin.from("service_part_log").delete().eq("id_servis", idServis);

    // 4. Mark receivable as Dibatalkan if exists
    await admin.from("receivables").update({ status: "Dibatalkan" })
      .eq("source_type", "Servis").eq("source_id", idServis);

    // 5. Zero out costs (status stays visible, Dibatalkan not in DB constraint yet)
    await admin.from("service_orders").update({ biaya_jasa: 0, biaya_part: 0 })
      .eq("id_servis", idServis);

    // 6. Audit log
    await admin.rpc("log_admin_action", {
      p_aksi: "finance_reversal",
      p_target: idServis,
      p_detail: { aksi: "cancel_service", alasan: "Pembatalan service order oleh Owner" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/service/[id]/cancel failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
