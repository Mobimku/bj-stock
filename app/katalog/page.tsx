import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { CatalogFilterBar } from "./filter-bar";
import { CatalogSortSheet } from "./sort-sheet";
import { CatalogViewTracker } from "./event-tracker";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type CatalogUnit = {
  id_unit: string;
  brand: string;
  model: string | null;
  spek_saat_ini: string | null;
  harga_listing: number;
  foto_url: string[] | null;
  updated_at: string;
};

export default async function KatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ price?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_catalog_units");
  const units = (data ?? []) as CatalogUnit[];

  // Apply filters
  let filtered = [...units];
  if (sp.price === "under_2") filtered = filtered.filter((u) => u.harga_listing < 2_000_000);
  if (sp.price === "2_to_5") filtered = filtered.filter((u) => u.harga_listing >= 2_000_000 && u.harga_listing <= 5_000_000);
  if (sp.price === "over_5") filtered = filtered.filter((u) => u.harga_listing > 5_000_000);
  const byId = (a: CatalogUnit, b: CatalogUnit) => a.id_unit.localeCompare(b.id_unit);
  switch (sp.sort) {
    case "price_asc": filtered.sort((a, b) => a.harga_listing - b.harga_listing || byId(a, b)); break;
    case "price_desc": filtered.sort((a, b) => b.harga_listing - a.harga_listing || byId(a, b)); break;
    case "oldest": filtered.sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at) || byId(a, b)); break;
    default: filtered.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || byId(a, b));
  }

  const activePrice = sp.price ?? "";
  const activeSort = sp.sort ?? "newest";

  return (
    <main className="min-h-screen bg-[#f7faf7] text-[#172019]">
      <CatalogViewTracker />
      <header className="sticky top-0 z-10 bg-[#198929]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4 md:px-6 md:py-3">
          <img src="/logo.svg" alt="BJ" className="h-14 w-auto shrink-0 md:h-10" />
          <div>
            <h1 className="text-lg font-bold text-white">BJ Laptop</h1>
            <p className="mt-0.5 text-[12px] text-white/75">Katalog lengkap dan update.</p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl">
        <CatalogFilterBar activePrice={activePrice} activeSort={activeSort} />
        <CatalogSortSheet
          activeSort={activeSort}
          price={activePrice}
        />

        <div className="grid grid-cols-2 gap-3 px-5 pb-24 pt-4 sm:grid-cols-3 md:gap-4 md:px-6 md:pb-12 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((unit) => {
            const photoUrl = unit.foto_url?.[0] ?? null;
            return (
              <Link
                key={unit.id_unit}
                href={`/katalog/${unit.id_unit}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-[#dde5de] bg-white transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-[4/3] bg-[#eaf0ec]">
                  {photoUrl ? (
                    <Image src={photoUrl} alt="" fill className="object-cover" sizes="(max-width: 639px) calc((100vw - 52px) / 2), (max-width: 767px) calc((100vw - 64px) / 3), (max-width: 1023px) calc((100vw - 80px) / 3), (max-width: 1279px) calc((100vw - 96px) / 4), 208px" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#5e6b61]/30">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[46%]"><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M2 18h20l-1.5 2h-17z" /></svg>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5e6b61]">{unit.brand}</p>
                  <p className="text-[13.5px] font-bold leading-tight">{unit.model ?? "—"}</p>
                  {unit.spek_saat_ini && (
                    <p className="mt-1 truncate font-mono text-[10.5px] text-[#5e6b61]">{unit.spek_saat_ini}</p>
                  )}
                  <div className="mt-auto border-t border-dashed border-[#dde5de] pt-2">
                    <span className="font-mono text-[15px] font-bold text-[#12621e]">{formatCurrency(unit.harga_listing)}</span>
                    <span className="block font-mono text-[9px] text-[#5e6b61]/70">{unit.id_unit}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="px-5 pb-24 text-center text-sm text-[#5e6b61]">Tidak ada unit yang ditemukan.</p>
        )}
      </div>
    </main>
  );
}
