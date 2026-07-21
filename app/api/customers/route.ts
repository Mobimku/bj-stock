import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whatsappSchema } from "@/lib/validation/whatsapp";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "teknisi", "owner"].includes(role)) {
      return NextResponse.json({ error: "Role tidak diizinkan melihat customer." }, { status: 403 });
    }

    const wa = whatsappSchema.safeParse(new URL(request.url).searchParams.get("wa"));
    if (!wa.success) {
      return NextResponse.json({ error: "Nomor WhatsApp tidak valid." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customers")
      .select("id_customer, nama, kontak_wa, segmen, sumber_lead")
      .eq("kontak_wa", wa.data)
      .maybeSingle();

    if (error) return NextResponse.json({ error: "Customer gagal dicari." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Customer tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ customer: data });
  } catch (error) {
    console.error("GET /api/customers failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
