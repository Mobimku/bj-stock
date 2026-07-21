import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowedKeys, numericKeys } from "@/lib/app-settings";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    const role = authData.user.app_metadata.role;
    if (role !== "admin" && role !== "owner") {
      return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .order("key");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (error) { // no-excuse-ok: catch
    console.error("GET /api/settings/app-settings failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (authData.user.app_metadata.role !== "owner") {
      return NextResponse.json({ error: "Hanya owner yang dapat mengubah pengaturan." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body harus berupa objek key-value." }, { status: 400 });
    }

    const updates = body as Record<string, string>;

    for (const key of Object.keys(updates)) {
      if (!allowedKeys.includes(key)) {
        return NextResponse.json({ error: `Key "${key}" tidak dikenali.` }, { status: 400 });
      }
      if (numericKeys.includes(key)) {
        const val = parseInt(updates[key], 10);
        if (isNaN(val) || val <= 0) {
          return NextResponse.json({ error: `Nilai "${key}" harus angka positif.` }, { status: 400 });
        }
      }
      if (key === "store_google_maps_url" && updates[key].trim()) {
        try {
          const url = new URL(updates[key]);
          if (url.protocol !== "https:") throw new Error("HTTPS required");
          updates[key] = url.toString();
        } catch {
          return NextResponse.json({ error: "URL Google Maps harus berupa URL HTTPS yang valid." }, { status: 400 });
        }
      }
    }

    // Get old values for audit
    const { data: oldSettings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", Object.keys(updates));

    const before: Record<string, string> = {};
    (oldSettings ?? []).forEach((s) => {
      before[s.key] = s.value;
    });

    // Upsert each setting
    for (const [key, value] of Object.entries(updates)) {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key, value: String(value).trim(), updated_at: new Date().toISOString() });

      if (error) {
        return NextResponse.json({ error: `Gagal menyimpan "${key}": ${error.message}` }, { status: 500 });
      }
    }

    // Log audit
    await supabase.rpc("log_admin_action", {
      p_aksi: "update_app_setting",
      p_target: null,
      p_detail: { before, after: updates, performed_by: authData.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) { // no-excuse-ok: catch
    console.error("PATCH /api/settings/app-settings failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
