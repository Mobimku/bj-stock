import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    if (authData.user.app_metadata.role !== "owner") {
      return NextResponse.json({ error: "Hanya owner yang dapat mengelola akun." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const action = body?.action; // "deactivate" | "reactivate"

    if (!["deactivate", "reactivate"].includes(action)) {
      return NextResponse.json({ error: "Aksi harus deactivate atau reactivate." }, { status: 400 });
    }

    const supabaseAdmin = await createAdminClient();

    // Prevent deactivating the last active owner
    if (action === "deactivate") {
      const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(id);
      if (targetUser?.user?.app_metadata?.role === "owner") {
        const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
        const activeOwners = (allUsers?.users ?? []).filter(
          (u) => u.app_metadata?.role === "owner" && u.banned_until === null && u.id !== id,
        );
        if (activeOwners.length === 0) {
          return NextResponse.json(
            { error: "Tidak dapat menonaktifkan satu-satunya owner aktif." },
            { status: 400 },
          );
        }
      }
    }

    const banDuration = action === "deactivate" ? "720h" : "none";
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: banDuration,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const aksi = action === "deactivate" ? "deactivate_account" : "reactivate_account";
    await supabase.rpc("log_admin_action", {
      p_aksi: aksi,
      p_target: id,
      p_detail: { performed_by: authData.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/settings/accounts/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}