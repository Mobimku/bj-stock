import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().min(1).max(100);
const statusSchema = z.object({
  listingPrice: z.coerce.number().positive("Harga listing wajib lebih dari 0.").optional(),
});

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
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat mengubah status unit." }, { status: 403 });
    }

    const id = idSchema.safeParse((await params).id);
    if (!id.success) {
      return NextResponse.json({ error: "ID unit tidak valid." }, { status: 400 });
    }

    const input = statusSchema.safeParse(await request.json().catch(() => ({})));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Harga listing tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .rpc("advance_unit_status", {
        p_id_unit: id.data,
        p_harga_listing: input.data.listingPrice ?? null,
      })
      .single();

    if (error) {
      const invalidTransition = error.code === "P0001";
      const notFound = error.code === "P0002";
      return NextResponse.json(
        {
          error: invalidTransition
            ? error.message.includes("Harga listing")
              ? error.message
              : "Status ini tidak dapat dilanjutkan secara manual."
            : notFound
              ? "Unit tidak ditemukan."
              : "Status unit gagal diperbarui.",
        },
        { status: invalidTransition ? 400 : notFound ? 404 : 500 },
      );
    }

    return NextResponse.json({ unit: data });
  } catch (error) {
    console.error("PATCH /api/units/[id]/status failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
