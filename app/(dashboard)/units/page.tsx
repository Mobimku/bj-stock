import Image from "next/image";
import Link from "next/link";
import { z } from "zod";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const statuses = ["Masuk", "QC", "Ready", "Listed", "Terjual", "Selesai"] as const;
const sorts = ["newest", "oldest", "price_asc", "price_desc", "az"] as const;
const views = ["card", "list"] as const;
const filterSchema = z.object({
  brand: z.string().trim().max(50).optional().catch(undefined),
  status: z.enum(statuses).optional().catch(undefined),
  sort: z.enum(sorts).catch("newest"),
  view: z.enum(views).catch("card"),
});
const unitListSchema = z.array(
  z.object({
    id_unit: z.string(),
    brand: z.string(),
    model: z.string().nullable(),
    status: z.enum(statuses),
    total_modal: z.union([z.number(), z.string()]),
    harga_listing: z.union([z.number(), z.string()]).nullable(),
    foto_url: z.array(z.url()).nullable(),
    tanggal_masuk: z.string(),
    created_at: z.string(),
  }),
);
const brandListSchema = z.array(z.object({ brand: z.string() }));
type Filters = z.infer<typeof filterSchema>;
type Unit = z.infer<typeof unitListSchema>[number];

const statusColor: Record<(typeof statuses)[number], string> = {
  Masuk: "bg-sky-100 text-sky-800",
  QC: "bg-violet-100 text-violet-800",
  Ready: "bg-emerald-100 text-emerald-800",
  Listed: "bg-amber-100 text-amber-800",
  Terjual: "bg-stone-800 text-white",
  Selesai: "bg-stone-200 text-stone-600",
};

function viewHref(filters: Filters, view: (typeof views)[number]) {
  const params = new URLSearchParams();
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  if (view !== "card") params.set("view", view);
  const query = params.toString();
  return query ? `/units?${query}` : "/units";
}

function UnitPhoto({ unit, compact = false }: { readonly unit: Unit; readonly compact?: boolean }) {
  const photo = unit.foto_url?.[0];
  return (
    <div
      className={
        compact
          ? "relative h-[54px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-[72px] sm:w-24"
          : "relative aspect-[4/3] w-full overflow-hidden bg-stone-100"
      }
    >
      {photo ? (
        <Image
          alt={`Foto ${unit.brand} ${unit.model ?? ""} (${unit.id_unit})`}
          className="object-cover"
          fill
          sizes={compact ? "(max-width: 639px) 72px, 96px" : "(max-width: 639px) calc(100vw - 32px), (max-width: 767px) calc(100vw - 48px), (max-width: 1279px) calc((100vw - 64px) / 2), 400px"}
          src={photo}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center text-xs text-stone-500">
          <svg aria-hidden="true" className={compact ? "h-5 w-7" : "h-12 w-16"} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <rect height="12" rx="1.5" width="18" x="3" y="4" />
            <path d="M2 18h20l-1.5 2h-17z" />
          </svg>
          <span>Foto belum tersedia</span>
        </div>
      )}
    </div>
  );
}

function UnitMoney({ unit }: { readonly unit: Unit }) {
  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase text-stone-600">Harga Listing</p>
        <p className="mt-1 font-mono font-black text-emerald-800">
          {unit.harga_listing === null ? "Belum diatur" : formatCurrency(unit.harga_listing)}
        </p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-stone-600">Total Modal</p>
        <p className="mt-1 font-mono text-sm font-bold text-stone-700">{formatCurrency(unit.total_modal)}</p>
      </div>
    </>
  );
}

export default async function UnitsPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = filterSchema.parse({
    brand: typeof params.brand === "string" ? params.brand : undefined,
    status: typeof params.status === "string" ? params.status : undefined,
    sort: typeof params.sort === "string" ? params.sort : undefined,
    view: typeof params.view === "string" ? params.view : undefined,
  });
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  let query = supabase
    .from("units")
    .select("id_unit, brand, model, status, total_modal, harga_listing, foto_url, tanggal_masuk, created_at");

  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.status) query = query.eq("status", filters.status);
  switch (filters.sort) {
    case "newest":
      query = query.order("tanggal_masuk", { ascending: false }).order("created_at", { ascending: false }).order("id_unit", { ascending: true });
      break;
    case "oldest":
      query = query.order("tanggal_masuk", { ascending: true }).order("created_at", { ascending: true }).order("id_unit", { ascending: true });
      break;
    case "price_asc":
      query = query.order("harga_listing", { ascending: true, nullsFirst: false }).order("id_unit", { ascending: true });
      break;
    case "price_desc":
      query = query.order("harga_listing", { ascending: false, nullsFirst: false }).order("id_unit", { ascending: true });
      break;
    case "az":
      query = query.order("brand", { ascending: true }).order("model", { ascending: true, nullsFirst: false }).order("id_unit", { ascending: true });
      break;
    default:
      return filters.sort;
  }

  const [{ data, error }, brandResult] = await Promise.all([
    query,
    supabase.from("units").select("brand").order("brand"),
  ]);
  const units = unitListSchema.safeParse(data);
  const brandRows = brandListSchema.safeParse(brandResult.data);
  const brands = brandRows.success ? [...new Set(brandRows.data.map((row) => row.brand))] : [];
  const viewClass = "flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Inventory</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Daftar unit</h1>
          <p className="mt-2 text-stone-600">Pantau posisi setiap laptop dari masuk sampai selesai.</p>
        </div>
        {['admin', 'owner'].includes(authData.user?.app_metadata.role ?? '') && (
          <Link className="flex min-h-11 items-center rounded-xl bg-stone-950 px-5 py-3 font-bold text-white hover:bg-amber-700 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2" href="/units/new">Tambah unit</Link>
        )}
      </div>

      <form className="mt-8 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto_auto]" method="get">
        <input name="sort" type="hidden" value={filters.sort} />
        <input name="view" type="hidden" value={filters.view} />
        <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Brand
          <select className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700" name="brand" defaultValue={filters.brand ?? ""}>
            <option value="">Semua brand</option>
            {brands.map((brand) => <option key={brand}>{brand}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Status
          <select className="mt-1 block min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700" name="status" defaultValue={filters.status ?? ""}>
            <option value="">Semua status</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <button className="min-h-11 self-end rounded-lg bg-amber-700 px-4 py-2 font-bold text-white hover:bg-amber-800 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2" type="submit">Terapkan</button>
        <Link className="flex min-h-11 items-center justify-center self-end rounded-lg px-4 py-2 font-bold text-stone-600 hover:bg-stone-100 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2" href="/units">Reset</Link>
      </form>

      {units.success && (
        <section aria-label="Pengaturan tampilan unit" className="mt-6 flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="pb-2 text-sm font-bold text-stone-600">{units.data.length} unit</p>
          <div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-end">
            <form className="flex items-end gap-2" method="get">
              {filters.brand && <input name="brand" type="hidden" value={filters.brand} />}
              {filters.status && <input name="status" type="hidden" value={filters.status} />}
              <input name="view" type="hidden" value={filters.view} />
              <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Urutkan
                <select className="mt-1 block min-h-11 rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700" name="sort" defaultValue={filters.sort}>
                  <option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="price_asc">Termurah</option><option value="price_desc">Termahal</option><option value="az">A-Z</option>
                </select>
              </label>
              <button className="min-h-11 rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:border-amber-600 hover:text-amber-800 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2" type="submit">Urutkan</button>
            </form>
            <nav aria-label="Tampilan daftar unit" className="grid grid-cols-2 rounded-xl bg-stone-100 p-1">
              {views.map((view) => (
                <Link aria-current={filters.view === view ? "page" : undefined} className={`${viewClass} ${filters.view === view ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-900"}`} href={viewHref(filters, view)} key={view}>
                  {view === "card" ? "Kartu" : "Daftar"}
                </Link>
              ))}
            </nav>
          </div>
        </section>
      )}

      {(error || !units.success) && <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700" role="alert">Data unit gagal dimuat.</p>}
      {units.success && units.data.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">Belum ada unit yang cocok dengan filter.</div>}
      {units.success && units.data.length > 0 && filters.view === "card" && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.data.map((unit) => (
            <Link className="group overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700" href={`/units/${unit.id_unit}`} key={unit.id_unit}>
              <UnitPhoto unit={unit} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-mono text-xs font-bold text-stone-500">{unit.id_unit}</p><h2 className="mt-2 break-words text-xl font-black leading-7 group-hover:text-amber-800">{unit.brand} {unit.model}</h2></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusColor[unit.status]}`}>{unit.status}</span></div>
                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-stone-100 pt-4"><UnitMoney unit={unit} /></div>
                <p className="mt-4 text-right text-sm text-stone-500">Masuk {formatDate(unit.tanggal_masuk)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      {units.success && units.data.length > 0 && filters.view === "list" && (
        <ul className="mt-6 divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {units.data.map((unit) => (
            <li key={unit.id_unit}>
              <Link className="group grid grid-cols-[72px_minmax(0,1fr)] gap-3 p-3 hover:bg-amber-50/50 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-700 sm:grid-cols-[96px_minmax(0,1fr)_minmax(240px,auto)] sm:items-center sm:p-4" href={`/units/${unit.id_unit}`}>
                <UnitPhoto compact unit={unit} />
                <div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-mono text-xs font-bold text-stone-500">{unit.id_unit}</p><h2 className="break-words font-black group-hover:text-amber-800">{unit.brand} {unit.model}</h2></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusColor[unit.status]}`}>{unit.status}</span></div><p className="mt-2 text-sm text-stone-500">Masuk {formatDate(unit.tanggal_masuk)}</p></div>
                <div className="col-span-2 grid grid-cols-2 gap-3 border-t border-stone-100 pt-3 sm:col-span-1 sm:border-0 sm:pt-0"><UnitMoney unit={unit} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
