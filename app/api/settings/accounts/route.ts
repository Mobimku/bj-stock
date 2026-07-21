import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (authData.user.app_metadata.role !== "owner") {
      return NextResponse.json({ error: "Hanya owner yang dapat mengakses manajemen akun." }, { status: 403 });
    }

    const supabaseAdmin = await createAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users = (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      role: u.app_metadata?.role ?? "unknown",
      nama: u.user_metadata?.nama ?? null,
      created_at: u.created_at,
      banned: u.banned_until !== null,
      last_sign_in: u.last_sign_in_at,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/settings/accounts failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (authData.user.app_metadata.role !== "owner") {
      return NextResponse.json({ error: "Hanya owner yang dapat membuat akun." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const email = body?.email?.trim();
    const role = body?.role;
    const nama = body?.nama?.trim();

    if (!email || !role || !nama) {
      return NextResponse.json({ error: "Email, role, dan nama wajib diisi." }, { status: 400 });
    }
    if (!["admin", "teknisi"].includes(role)) {
      return NextResponse.json({ error: "Role hanya boleh admin atau teknisi." }, { status: 400 });
    }
    if (nama.length < 2) {
      return NextResponse.json({ error: "Nama terlalu pendek." }, { status: 400 });
    }

    const supabaseAdmin = await createAdminClient();
    const tempPassword =
      Math.random().toString(36).slice(2, 8) +
      Math.random().toString(36).toUpperCase().slice(2, 6) +
      "Bj1!";
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { nama },
      app_metadata: { role },
    });

    if (createError) {
      const status = createError.message?.includes("already") ? 409 : 500;
      return NextResponse.json({ error: createError.message }, { status });
    }

    // Log audit action
    await supabase.rpc("log_admin_action", {
      p_aksi: "create_account",
      p_target: newUser.user?.id,
      p_detail: { email, role, nama, created_by: authData.user.id },
    });

    return NextResponse.json(
      { id: newUser.user?.id, email, role, nama, tempPassword },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/settings/accounts failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}