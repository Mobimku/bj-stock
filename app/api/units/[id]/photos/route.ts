import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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
      return NextResponse.json({ error: "Hanya admin yang dapat menambah foto." }, { status: 403 });
    }

    const { id } = await params;

    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id_unit, foto_url")
      .eq("id_unit", id)
      .maybeSingle();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit tidak ditemukan." }, { status: 404 });
    }

    const existingPhotos: string[] = unit.foto_url ?? [];
    if (existingPhotos.length >= 4) {
      return NextResponse.json({ error: "Maksimal 4 foto per unit." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.count !== "number" || body.count < 1 || body.count > 4) {
      return NextResponse.json({ error: "Jumlah foto tidak valid (1-4)." }, { status: 400 });
    }

    const maxNew = 4 - existingPhotos.length;
    if (body.count > maxNew) {
      return NextResponse.json(
        { error: `Hanya bisa menambah ${maxNew} foto lagi (maksimal 4 total).` },
        { status: 400 },
      );
    }

    // Generate signed upload URLs — one per photo
    const signedUploads = await Promise.all(
      Array.from({ length: body.count }, async () => {
        const fileExt = body.fileExt ?? "webp";
        const path = `${id}/${randomUUID()}.${fileExt}`;
        const { data, error } = await supabase.storage
          .from("unit-photos")
          .createSignedUploadUrl(path, { upsert: false });

        if (error || !data?.signedUrl) {
          throw new Error(`Gagal membuat signed URL: ${error?.message ?? "unknown"}`);
        }

        return { signedUrl: data.signedUrl, path, token: data.token };
      }),
    );

    return NextResponse.json({ uploads: signedUploads }, { status: 200 });
  } catch (error) {
    console.error("POST /api/units/[id]/photos failed", error);
    if (error instanceof Error && error.message.startsWith("Gagal membuat")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function PUT(
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
      return NextResponse.json({ error: "Hanya admin yang dapat menambah foto." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (!body || !Array.isArray(body.paths) || body.paths.length === 0) {
      return NextResponse.json({ error: "paths array diperlukan." }, { status: 400 });
    }

    const paths: string[] = body.paths;

    if (!paths.every((p: string) => p.startsWith(`${id}/`))) {
      return NextResponse.json({ error: "Path foto tidak valid untuk unit ini." }, { status: 400 });
    }

    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id_unit, foto_url")
      .eq("id_unit", id)
      .maybeSingle();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit tidak ditemukan." }, { status: 404 });
    }

    const existingPhotos: string[] = unit.foto_url ?? [];
    if (existingPhotos.length + paths.length > 4) {
      return NextResponse.json(
        { error: `Total foto tidak boleh melebihi 4. Saat ini sudah ada ${existingPhotos.length}.` },
        { status: 400 },
      );
    }

    // Verify files exist in storage before committing
    const newUrls = paths.map(
      (path) => supabase.storage.from("unit-photos").getPublicUrl(path).data.publicUrl,
    );

    const allPhotos = [...existingPhotos, ...newUrls];

    const { error: updateError } = await supabase
      .from("units")
      .update({ foto_url: allPhotos })
      .eq("id_unit", id);

    if (updateError) {
      return NextResponse.json({ error: "URL foto gagal disimpan." }, { status: 500 });
    }

    return NextResponse.json({ foto_url: allPhotos }, { status: 200 });
  } catch (error) {
    console.error("PUT /api/units/[id]/photos failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}

export async function DELETE(
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
      return NextResponse.json({ error: "Hanya admin yang dapat menghapus foto." }, { status: 403 });
    }

    const { id } = await params;
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL foto diperlukan." }, { status: 400 });
    }

    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id_unit, foto_url")
      .eq("id_unit", id)
      .maybeSingle();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit tidak ditemukan." }, { status: 404 });
    }

    const photos: string[] = unit.foto_url ?? [];
    if (!photos.includes(url)) {
      return NextResponse.json({ error: "URL tidak ditemukan di foto unit." }, { status: 404 });
    }

    const storagePrefix = "/object/public/unit-photos/";
    const idx = url.indexOf(storagePrefix);
    if (idx === -1) {
      return NextResponse.json({ error: "URL foto tidak valid." }, { status: 400 });
    }
    const storagePath = url.slice(idx + storagePrefix.length);

    const { error: removeError } = await supabase.storage
      .from("unit-photos")
      .remove([storagePath]);

    if (removeError) {
      return NextResponse.json({ error: "Gagal menghapus file dari penyimpanan." }, { status: 500 });
    }

    const updatedPhotos = photos.filter((p) => p !== url);
    const { error: updateError } = await supabase
      .from("units")
      .update({ foto_url: updatedPhotos.length > 0 ? updatedPhotos : null })
      .eq("id_unit", id);

    if (updateError) {
      return NextResponse.json({ error: "Gagal memperbarui data unit." }, { status: 500 });
    }

    return NextResponse.json({ foto_url: updatedPhotos }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/units/[id]/photos failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}