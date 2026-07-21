import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { whatsappSchema } from "@/lib/validation/whatsapp";

const updateSchema = z.object({
  nama: z.string().trim().min(1).max(100).optional(),
  kontak_wa: whatsappSchema.optional(),
  segmen: z.enum(["Pelajar", "Orang Tua", "Remote Worker", "Lainnya"]).nullable().optional(),
  sumber_lead: z.enum(["TikTok", "Reels", "Instagram", "Facebook Marketplace", "WA", "Referral", "Lainnya"]).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat mengubah data customer." }, { status: 403 });
    }

    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) {
      return NextResponse.json({ error: "ID customer tidak valid." }, { status: 400 });
    }

    const input = updateSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json({ error: input.error.issues[0]?.message ?? "Input tidak valid." }, { status: 400 });
    }

    // Filter out undefined values (don't unset fields)
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input.data)) {
      if (value !== undefined) updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id_customer", id.data)
      .select("id_customer, nama, kontak_wa, segmen, sumber_lead")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Nomor WhatsApp sudah terdaftar untuk customer lain." }, { status: 409 });
      }
      return NextResponse.json({ error: "Gagal mengupdate customer." }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (error) {
    console.error("PATCH /api/customers/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const role = authData.user?.app_metadata.role;

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat menghapus customer." }, { status: 403 });
    }

    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) {
      return NextResponse.json({ error: "ID customer tidak valid." }, { status: 400 });
    }

    // Check for existing sales/service orders
    const [salesRes, svcRes] = await Promise.all([
      supabase.from("sales").select("id_invoice").eq("id_customer", id.data).limit(1),
      supabase.from("service_orders").select("id_servis").eq("id_customer", id.data).limit(1),
    ]);

    const hasSales = (salesRes.data?.length ?? 0) > 0;
    const hasServices = (svcRes.data?.length ?? 0) > 0;

    if (hasSales || hasServices) {
      const reasons = [
        hasSales ? `${salesRes.data!.length} transaksi pembelian` : "",
        hasServices ? `${svcRes.data!.length} service order` : "",
      ].filter(Boolean).join(" dan ");
      return NextResponse.json({
        error: `Customer tidak dapat dihapus karena memiliki ${reasons}. Nonaktifkan atau pindahkan data terlebih dahulu.`,
      }, { status: 409 });
    }

    const { error } = await supabase.from("customers").delete().eq("id_customer", id.data);

    if (error) {
      return NextResponse.json({ error: "Gagal menghapus customer." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/customers/[id] failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
