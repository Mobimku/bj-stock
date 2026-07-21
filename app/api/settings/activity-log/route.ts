import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (authData.user.app_metadata.role !== "owner") {
      return NextResponse.json({ error: "Hanya owner yang dapat mengakses log aktivitas." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const aksiFilter = searchParams.get("aksi");
    const userIdFilter = searchParams.get("user_id");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    let query = supabase
      .from("admin_actions_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (aksiFilter) {
      query = query.eq("aksi", aksiFilter);
    }
    if (userIdFilter) {
      query = query.eq("user_id", userIdFilter);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data });
  } catch (error) {
    console.error("GET /api/settings/activity-log failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}