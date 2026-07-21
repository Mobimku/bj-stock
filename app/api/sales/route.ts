import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SALE_TEST_BLOCKER_KEYS, saleSchema } from "@/lib/validation/sales";

const createdSaleSchema = z.object({ id_invoice: z.string() });
const saleTestBlockerSchema = z.enum(SALE_TEST_BLOCKER_KEYS);
const saleTestBlockerLabels = {
  identity_mismatch: "identitas unit tidak sesuai",
  serial_mismatch: "nomor serial tidak sesuai",
  spec_mismatch: "spesifikasi unit tidak sesuai",
  swollen_battery: "baterai menggelembung",
  bios_lock: "BIOS masih terkunci",
  mdm_lock: "perangkat masih terikat MDM",
  unsafe_charger: "charger tidak aman",
} satisfies Record<(typeof SALE_TEST_BLOCKER_KEYS)[number], string>;

function invalidTestMessage(message: string) {
  const match = /hard blocker ([a-z_]+) harus Lulus/.exec(message);
  const blocker = saleTestBlockerSchema.safeParse(match?.[1]);
  return blocker.success
    ? `Penjualan diblokir: ${saleTestBlockerLabels[blocker.data]}.`
    : "Pengujian unit harus lengkap, bebas blocker, dan telah disetujui pembeli.";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ error: "Sesi login diperlukan." }, { status: 401 });
    }
    if (!["admin", "owner"].includes(authData.user.app_metadata.role)) {
      return NextResponse.json({ error: "Hanya admin dan owner yang dapat membuat transaksi." }, { status: 403 });
    }

    const input = saleSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues[0]?.message ?? "Input transaksi tidak valid." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .rpc("create_sale", {
        p_id_unit: input.data.unitId,
        p_id_customer: input.data.customerId,
        p_customer_name: input.data.customerName,
        p_customer_wa: input.data.customerWa,
        p_customer_segment: input.data.customerSegment,
        p_customer_source: input.data.customerSource,
        p_harga_jual: input.data.salePrice,
        p_channel: input.data.channel,
        p_metode_bayar: input.data.paymentMethod,
        p_tanggal_transaksi: input.data.transactionDate,
        p_durasi_garansi_hari: input.data.warrantyDays,
        p_test: {
          test_results: input.data.unitTest.testResults,
          blocking_checks: input.data.unitTest.blockingChecks,
          location: input.data.unitTest.location,
          acknowledged: input.data.unitTest.acknowledged,
        },
      })
      .single();
    const sale = createdSaleSchema.safeParse(data);

    if (error) {
      const invalidTest = error.code === "22023";
      const notFound = error.code === "P0002";
      const invalidSale = error.code === "P0001" || error.code === "23505" || error.code === "23514";
      return NextResponse.json(
        {
          error: invalidTest
            ? invalidTestMessage(error.message)
            : notFound
              ? "Unit atau customer tidak ditemukan."
              : invalidSale
                ? "Unit sudah memiliki penjualan aktif. Batalkan penjualan sebelumnya terlebih dahulu."
                : "Transaksi gagal disimpan.",
        },
        { status: notFound ? 404 : invalidTest || invalidSale ? 400 : 500 },
      );
    }
    if (!sale.success) {
      return NextResponse.json({ error: "Transaksi gagal disimpan." }, { status: 500 });
    }

    return NextResponse.json({ idInvoice: sale.data.id_invoice }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
