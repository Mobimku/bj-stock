import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";
import { CatalogDetailTracker, CatalogWhatsAppLink } from "../event-tracker";
import { KatalogDetailClient } from "./client";
import { CatalogFloatingActions } from "./floating-actions";

type CatalogUnit = {
  id_unit: string;
  brand: string;
  model: string | null;
  spek_saat_ini: string | null;
  kondisi_fungsi: string | null;
  harga_listing: number;
  foto_url: string[] | null;
  status: string;
  tanggal_masuk: string;
};

export const dynamic = "force-dynamic";

async function getData(id_unit: string) {
  const supabase = await createClient();
  const [unitRes, waRes, warrantyRes, mapsRes] = await Promise.all([
    supabase.rpc("get_catalog_unit", { p_id_unit: id_unit }),
    supabase.rpc("get_store_whatsapp_number"),
    supabase.rpc("get_store_setting", { p_key: "default_warranty_unit_days" }),
    supabase.rpc("get_store_setting", { p_key: "store_google_maps_url" }),
  ]);
  return {
    unit: (unitRes.data as CatalogUnit[] | null)?.[0] ?? null,
    waNumber: (waRes.data as string | null) ?? "",
    warrantyDays: (warrantyRes.data as string | null) ?? null,
    mapsUrl: (mapsRes.data as string | null) ?? "",
    error: unitRes.error,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id_unit: string }>;
}): Promise<Metadata> {
  const { id_unit } = await params;
  const { unit } = await getData(id_unit);

  if (!unit || unit.status !== "Listed") {
    return { title: "Unit Tidak Tersedia — BJ Laptop" };
  }

  const title = `${unit.brand} ${unit.model ?? ""} — BJ Laptop`;
  const description = unit.spek_saat_ini
    ? `${unit.brand} ${unit.model} — ${unit.spek_saat_ini}. Rp${Number(unit.harga_listing).toLocaleString("id-ID")}`
    : `${unit.brand} ${unit.model} — Rp${Number(unit.harga_listing).toLocaleString("id-ID")}`;
  const imageUrl = unit.foto_url?.[0] ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "id_ID",
      siteName: "BJ Laptop",
      ...(imageUrl && {
        images: [{ url: imageUrl, width: 1200, height: 900, alt: `${unit.brand} ${unit.model}` }],
      }),
    },
  };
}

export default async function KatalogDetailPage({
  params,
}: {
  params: Promise<{ id_unit: string }>;
}) {
  const { id_unit } = await params;
  const { unit, waNumber, warrantyDays, mapsUrl } = await getData(id_unit);

  if (!unit || unit.status !== "Listed") {
    return (
      <main className="min-h-screen bg-[#f7faf7] px-5 py-16 text-center text-[#172019]">
        <div className="mx-auto max-w-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#dde5de]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-[#5e6b61]">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h1 className="text-xl font-bold">Unit Tidak Tersedia</h1>
          <p className="mt-2 text-sm text-[#5e6b61]">
            Unit dengan kode <strong className="font-mono">{id_unit}</strong> tidak ditemukan atau sudah tidak tersedia untuk dijual.
          </p>
          <Link href="/katalog" className="mt-6 inline-block rounded-xl bg-[#198929] px-6 py-3 text-sm font-bold text-white">
            Kembali ke Katalog
          </Link>
        </div>
      </main>
    );
  }

  const photos = unit.foto_url ?? [];
  const brandModel = unit.model ? `${unit.brand} ${unit.model}` : unit.brand;
  const whatsappMessage = `Halo BJ Laptop, saya tertarik dengan unit ${unit.id_unit} - ${brandModel}.`;
  const whatsappHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <main className="min-h-screen bg-[#f7faf7] text-[#172019]">
      <CatalogDetailTracker idUnit={unit.id_unit} />
      <div className="mx-auto flex max-w-5xl items-center gap-2 border-b border-[#dde5de] bg-white px-5 py-4 md:border-b-0 md:bg-transparent md:px-6 md:pb-0">
        <Link href="/katalog" className="flex items-center gap-1 text-sm font-medium text-[#5e6b61]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Kembali
        </Link>
      </div>

      <KatalogDetailClient photos={photos}>
        <div className="px-5 pb-4">
          <p className="font-mono text-[11px] tracking-[0.03em] text-[#5e6b61]">{unit.brand} &middot; {unit.model ? unit.model.toUpperCase() + " SERIES" : ""}</p>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[21px] font-bold leading-tight">{unit.model ?? unit.brand}</h1>
          </div>

          <p className="mt-2 font-mono text-[26px] font-bold text-[#12621e]">{formatCurrency(unit.harga_listing)}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-[#eaf3de] px-3 py-1 text-[11.5px] font-semibold text-[#12621e]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3"><path d="M20 6L9 17l-5-5" /></svg>
              Tes Transparan
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-[#eaf3de] px-3 py-1 text-[11.5px] font-semibold text-[#12621e]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3"><path d="M20 6L9 17l-5-5" /></svg>
              Garansi Toko {warrantyDays || "30"} Hari
            </span>
          </div>

          <div className="mt-5">
            <p className="font-mono text-[11px] font-bold tracking-[0.08em] text-[#5e6b61]">SPESIFIKASI</p>
            <div className="mt-2 overflow-hidden rounded-xl border border-[#dde5de] bg-white">
              {unit.spek_saat_ini && (
                <div className="border-b border-dashed border-[#dde5de] px-4 py-3">
                  <p className="text-sm leading-relaxed whitespace-pre-line">{unit.spek_saat_ini}</p>
                </div>
              )}
              {unit.kondisi_fungsi && (
                <div className="flex flex-col gap-1 px-4 py-3">
                  <span className="text-sm text-[#5e6b61]">Kondisi Unit</span>
                  <span className="whitespace-pre-line font-mono text-sm font-medium">{unit.kondisi_fungsi}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-[#172019]">
              <svg viewBox="0 0 24 24" fill="none" stroke="#172019" strokeWidth="2" className="h-3.5 w-3.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2" /></svg>
            </div>
            <span className="font-mono text-[11px] text-[#5e6b61]">{unit.id_unit} &middot; masuk stock {formatDate(unit.tanggal_masuk)}</span>
          </div>
        </div>

        <CatalogFloatingActions
          idUnit={unit.id_unit}
          mapsUrl={mapsUrl}
          shareText={`${brandModel} — ${formatCurrency(unit.harga_listing)}`}
          shareTitle={`${brandModel} — BJ Laptop`}
        />

        <div className="sticky bottom-0 bg-gradient-to-t from-[#f7faf7] via-[#f7faf7]/95 to-transparent px-5 pb-5 pt-4 md:static md:bg-none md:pt-3">
          {waNumber ? (
            <CatalogWhatsAppLink href={whatsappHref} idUnit={unit.id_unit}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]"><path d="M17.6 6.3A8.7 8.7 0 0 0 12 4a8.8 8.8 0 0 0-7.6 13.2L3 21l3.9-1.3A8.8 8.8 0 0 0 12 21a8.8 8.8 0 0 0 5.6-15.7zM12 19.5a7.3 7.3 0 0 1-3.8-1l-.3-.2-2.3.8.7-2.2-.2-.3A7.4 7.4 0 1 1 19.4 12 7.4 7.4 0 0 1 12 19.5zm4-5.5c-.2-.1-1.3-.6-1.5-.7s-.4-.1-.5.1-.5.7-.6.8-.2.2-.4.1a6 6 0 0 1-1.8-1.1 6.6 6.6 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.3-.4.2-.3a.4.4 0 0 0 0-.4c-.1-.1-.5-1.2-.7-1.7s-.4-.4-.5-.4h-.4a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 1.9 4.5 4.5 0 0 0 1 2.4 10.2 10.2 0 0 0 4 3.5 4.5 4.5 0 0 0 2.7.6 2.3 2.3 0 0 0 1.5-1.1 1.9 1.9 0 0 0 .1-1.1c-.1-.1-.2-.1-.4-.2z" /></svg>
              Hubungi via WhatsApp
            </CatalogWhatsAppLink>
          ) : (
            <button disabled className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#dde5de] px-5 py-3.5 text-sm font-bold text-[#5e6b61]">
              Nomor WA toko belum diatur
            </button>
          )}
        </div>
      </KatalogDetailClient>
    </main>
  );
}
