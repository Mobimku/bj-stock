import Link from "next/link";
import { z } from "zod";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ClaimForm } from "./claim-form";

const unitIdPattern = /^BJ-[A-Z0-9]+-\d{4}-\d{3}$/;
const unitSchema = z.object({
  id_unit: z.string(),
  brand: z.string(),
  model: z.string().nullable(),
  serial_number: z.string().nullable(),
  status: z.string(),
});
const warrantySchema = z.object({
  id_garansi: z.string().uuid(),
  tanggal_mulai: z.string(),
  tanggal_berakhir: z.string(),
  status: z.enum(["Aktif", "Habis"]),
});
const claimsSchema = z.array(z.object({
  id_klaim: z.string().uuid(),
  tanggal: z.string(),
  keluhan: z.string(),
  tindakan: z.string().nullable(),
  biaya: z.union([z.number(), z.string()]),
}));

export default async function WarrantyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawUnitId = typeof params.unit === "string" ? params.unit.trim().toUpperCase() : "";
  const unitId = unitIdPattern.test(rawUnitId) ? rawUnitId : "";
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!rawUnitId) return <WarrantyLookup />;
  if (!unitId) return <WarrantyLookup error="Format ID unit tidak valid." />;

  const [unitResult, warrantyResult] = await Promise.all([
    supabase.from("units").select("id_unit, brand, model, serial_number, status").eq("id_unit", unitId).maybeSingle(),
    supabase.rpc("refresh_unit_warranty", { p_id_unit: unitId }).maybeSingle(),
  ]);
  const unit = unitSchema.safeParse(unitResult.data);
  if (!unitResult.data && !unitResult.error) return <WarrantyLookup error="Unit tidak ditemukan." />;
  if (unitResult.error || warrantyResult.error || !unit.success) {
    return <WarrantyLookup error="Data garansi gagal dimuat." />;
  }

  const warranty = warrantySchema.safeParse(warrantyResult.data);
  const claimsResult = warranty.success
    ? await supabase
        .from("warranty_claim")
        .select("id_klaim, tanggal, keluhan, tindakan, biaya")
        .eq("id_garansi", warranty.data.id_garansi)
        .order("tanggal", { ascending: false })
    : { data: [], error: null };
  const claims = claimsSchema.safeParse(claimsResult.data);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href="/warranty">Cari unit lain</Link>
          <p className="mt-6 font-mono text-sm font-bold text-amber-700">{unit.data.id_unit}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">{unit.data.brand} {unit.data.model}</h1>
          <p className="mt-2 text-stone-600">Serial: {unit.data.serial_number ?? "-"} · Status unit: {unit.data.status}</p>
        </div>
        <Link className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-bold hover:border-amber-600" href={`/units/${unit.data.id_unit}`}>Detail unit</Link>
      </div>

      {!warranty.success ? (
        <section className="mt-8 rounded-2xl border border-dashed border-stone-300 p-10 text-center">
          <h2 className="text-xl font-black">Belum ada garansi</h2>
          <p className="mt-2 text-stone-600">Garansi otomatis dibuat saat unit selesai dijual.</p>
        </section>
      ) : (
        <>
          <section className={`mt-8 rounded-2xl p-6 text-white ${warranty.data.status === "Aktif" ? "bg-emerald-800" : "bg-stone-700"}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Status garansi</p>
                <h2 className="mt-2 text-3xl font-black">{warranty.data.status}</h2>
              </div>
              <div className="grid grid-cols-2 gap-8 text-right">
                <div><p className="text-xs font-bold uppercase text-white/60">Mulai</p><p className="mt-1 font-black">{formatDate(warranty.data.tanggal_mulai)}</p></div>
                <div><p className="text-xs font-bold uppercase text-white/60">Berakhir</p><p className="mt-1 font-black">{formatDate(warranty.data.tanggal_berakhir)}</p></div>
              </div>
            </div>
          </section>

          {warranty.data.status === "Aktif" && ["admin", "owner"].includes(authData.user?.app_metadata.role ?? "") && (
            <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
              <details className="rounded-2xl border border-stone-200 bg-white p-6">
                <summary className="cursor-pointer text-lg font-black text-amber-800">Buat klaim garansi manual</summary>
                <ClaimForm unitId={unit.data.id_unit} defaultDate={new Date().toISOString().slice(0, 10)} />
              </details>
              <Link className="rounded-2xl bg-[#198929] px-6 py-5 text-center font-black text-white hover:bg-[#147522] sm:self-start" href={`/service/new?unit=${unit.data.id_unit}&claim=1`}>Buat order servis klaim</Link>
            </div>
          )}

          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-2xl font-black">Riwayat klaim</h2>
            {(claimsResult.error || !claims.success) && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">Riwayat klaim gagal dimuat.</p>}
            {claims.success && claims.data.length === 0 && <p className="mt-5 text-stone-500">Belum ada klaim pada garansi ini.</p>}
            {claims.success && claims.data.length > 0 && (
              <div className="mt-5 divide-y divide-stone-100">
                {claims.data.map((claim) => (
                  <div className="grid gap-3 py-5 sm:grid-cols-[1fr_auto]" key={claim.id_klaim}>
                    <div>
                      <p className="font-black">{claim.keluhan}</p>
                      <p className="mt-1 text-sm text-stone-600">Tindakan: {claim.tindakan ?? "Belum dicatat"}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-black">{formatCurrency(claim.biaya)}</p>
                      <p className="mt-1 text-sm text-stone-500">{formatDate(claim.tanggal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function WarrantyLookup({ error }: { error?: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Aftersales</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">Cek garansi unit</h1>
      <p className="mt-2 text-stone-600">Scan QR unit atau masukkan ID untuk melihat masa garansi dan riwayat klaim.</p>
      <div className="mt-8 grid gap-4 rounded-2xl border border-stone-200 bg-white p-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <form className="contents" method="get">
          <label className="text-sm font-bold text-stone-700">
            ID unit
            <input className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-mono uppercase outline-none focus:border-amber-600" name="unit" placeholder="BJ-HP-2607-001" required />
          </label>
          <button className="rounded-xl bg-stone-950 px-5 py-3 font-bold text-white hover:bg-amber-700" type="submit">Cari garansi</button>
        </form>
      </div>
      <Link className="mt-4 inline-block font-bold text-amber-700 hover:text-amber-900" href="/scan?purpose=warranty">Atau scan QR unit</Link>
      {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700" role="alert">{error}</p>}
    </main>
  );
}
