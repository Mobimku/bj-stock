import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { bankPartSchema } from "@/lib/validation/bank-stock";
import { unitDetailSchema, upgradeHistorySchema, specHistorySchema } from "@/lib/validation/unit";
import { StatusButton } from "./status-button";
import { UpgradeForm } from "./upgrade-form";
import { DelistButton, ReactivateButton } from "./delist-form";
import { DowngradePartButton } from "./downgrade-part-button";
import { EditSpecButton } from "./edit-spec-button";
import { PhotoUploadForm } from "./photo-upload";
import { PhotoGallery } from "./photo-gallery";
import { SpecHistory } from "./spec-history";
import { z } from "zod";

const nextStatus = { Masuk: "QC", QC: "Ready", Ready: "Listed" } as const;

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [unitResult, historyResult, authResult, partsResult, specHistoryResult] = await Promise.all([
    supabase.from("units").select("*").eq("id_unit", id).maybeSingle(),
    supabase
      .from("upgrade_log")
      .select("id_log, id_part, jenis, biaya, spek_setelah, tanggal, catatan")
      .eq("id_unit", id)
      .order("tanggal", { ascending: false }),
    supabase.auth.getUser(),
    supabase.from("bank_stock").select("*").gt("stock_qty", 0).order("jenis_part"),
    supabase
      .from("unit_spec_history")
      .select("id_history, id_unit, spek_saat_ini, kondisi_fisik, kondisi_fungsi, changed_by, changed_at, catatan")
      .eq("id_unit", id)
      .order("changed_at", { ascending: false }),
  ]);

  if (!unitResult.data && !unitResult.error) notFound();

  const unit = unitDetailSchema.safeParse(unitResult.data);
  const upgrades = upgradeHistorySchema.safeParse(historyResult.data);
  const parts = z.array(bankPartSchema).safeParse(partsResult.data);
  const specHistory = specHistorySchema.safeParse(specHistoryResult.data);
  if (
    unitResult.error ||
    historyResult.error ||
    partsResult.error ||
    specHistoryResult.error ||
    !unit.success ||
    !upgrades.success ||
    !parts.success ||
    !specHistory.success
  ) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <p className="rounded-xl bg-red-50 p-4 text-red-700" role="alert">
          Detail unit gagal dimuat.
        </p>
      </main>
    );
  }

  const isAdmin = ["admin", "owner"].includes(authResult.data.user?.app_metadata.role ?? "");
  const isTeknisi = authResult.data.user?.app_metadata.role === "teknisi";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <Link className="text-sm font-bold text-amber-700 hover:text-amber-900" href="/units">
        Kembali ke daftar
      </Link>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-stone-950 p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-bold text-amber-400">{unit.data.id_unit}</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                  {unit.data.brand} {unit.data.model}
                </h1>
                <p className="mt-3 text-stone-400">Serial: {unit.data.serial_number ?? "-"}</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-stone-950">
                {unit.data.status}
              </span>
            </div>
            <div className="mt-8 grid gap-5 border-t border-stone-800 pt-6 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs font-bold uppercase text-stone-500">Modal awal</p>
                <p className="mt-1 text-lg font-black">{formatCurrency(unit.data.modal_awal)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-500">Total modal</p>
                <p className="mt-1 text-lg font-black text-amber-400">{formatCurrency(unit.data.total_modal)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-500">Tanggal masuk</p>
                <p className="mt-1 text-lg font-black">{formatDate(unit.data.tanggal_masuk)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-500">Harga listing</p>
                <p className="mt-1 text-lg font-black">{unit.data.harga_listing ? formatCurrency(unit.data.harga_listing) : "-"}</p>
              </div>
            </div>
            {isAdmin && (unit.data.status in nextStatus || unit.data.status === "Listed") && (
              <StatusButton
                id={unit.data.id_unit}
                nextStatus={unit.data.status === "Listed" ? null : nextStatus[unit.data.status as keyof typeof nextStatus]}
                listingPrice={unit.data.harga_listing}
              />
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              {isAdmin && (unit.data.status === "Ready" || unit.data.status === "Listed") && (
                <Link className="rounded-xl bg-amber-600 px-5 py-3 font-bold text-stone-950 hover:bg-amber-500" href={`/sales/new?unit=${unit.data.id_unit}`}>
                  Jual unit
                </Link>
              )}
              {(unit.data.status === "Terjual" || unit.data.status === "Selesai") && (
                <Link className="rounded-xl border border-stone-700 px-5 py-3 font-bold hover:border-amber-400 hover:text-amber-400" href={`/warranty?unit=${unit.data.id_unit}`}>
                  Lihat garansi
                </Link>
              )}
              {(isAdmin || isTeknisi) && (
                <Link className="rounded-xl border border-stone-700 px-5 py-3 font-bold hover:border-[#ff751f] hover:text-[#ff751f]" href={`/service/new?unit=${unit.data.id_unit}`}>
                  Terima servis
                </Link>
              )}
              {isAdmin && (unit.data.status === "Ready" || unit.data.status === "Listed") && (
                <DelistButton id={unit.data.id_unit} />
              )}
            </div>
            {isAdmin && unit.data.status === "Delisted" && (
              <div className="mt-5 rounded-xl border border-red-800 bg-red-950/30 p-4">
                <p className="text-sm font-bold text-red-300">Unit Delisted</p>
                <p className="mt-1 text-sm text-red-200/70">Jenis: {unit.data.delist_jenis ?? "-"}</p>
                <p className="mt-1 text-sm text-red-200/70">Alasan: {unit.data.delist_alasan ?? "-"}</p>
                <p className="mt-1 text-sm text-red-200/70">Tanggal: {unit.data.delist_tanggal ? formatDate(unit.data.delist_tanggal) : "-"}</p>
                <ReactivateButton id={unit.data.id_unit} />
              </div>
            )}
          </section>

          {unit.data.foto_url && unit.data.foto_url.length > 0 && (
            <PhotoGallery
              id={unit.data.id_unit}
              fotoUrl={unit.data.foto_url}
              canDelete={isAdmin}
            />
          )}

          {isAdmin && unit.data.status !== "Delisted" && (
            <PhotoUploadForm id={unit.data.id_unit} currentCount={unit.data.foto_url?.length ?? 0} />
          )}

          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Spesifikasi</p>
                <h2 className="mt-1 text-2xl font-black">Spek & Kondisi</h2>
              </div>
              {isAdmin && unit.data.status !== "Delisted" && (
                <EditSpecButton unit={{
                  id_unit: unit.data.id_unit,
                  brand: unit.data.brand,
                  model: unit.data.model,
                  spek_saat_ini: unit.data.spek_saat_ini,
                  kondisi_fisik: unit.data.kondisi_fisik,
                  kondisi_fungsi: unit.data.kondisi_fungsi,
                }} />
              )}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase text-stone-400">Spesifikasi saat ini</p>
                <p className="mt-2 whitespace-pre-wrap font-medium text-stone-800">{unit.data.spek_saat_ini ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-400">Spek awal (snapshot)</p>
                <p className="mt-2 whitespace-pre-wrap font-medium text-stone-500">{unit.data.spek_awal ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-400">Kondisi fisik</p>
                <p className="mt-2 font-medium text-stone-800">{unit.data.kondisi_fisik ? `Grade ${unit.data.kondisi_fisik}` : "-"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-stone-400">Kondisi fungsi</p>
                <p className="mt-2 font-medium text-stone-800">{unit.data.kondisi_fungsi ?? "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-bold uppercase text-stone-400">Sumber beli</p>
                <p className="mt-2 font-medium text-stone-800">{unit.data.sumber_beli ?? "-"}</p>
              </div>
            </div>

            <details className="mt-6 rounded-xl bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-amber-700">
                Riwayat perubahan spesifikasi ({specHistory.data.length})
              </summary>
              <SpecHistory history={specHistory.data} />
            </details>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Riwayat biaya</p>
                <h2 className="mt-1 text-2xl font-black">Upgrade Log</h2>
              </div>
            </div>
            {(isAdmin || isTeknisi) && (
              <details className="mt-5 rounded-xl bg-stone-50 p-4">
                <summary className="cursor-pointer font-bold text-amber-700">Tambah upgrade / downgrade</summary>
                <UpgradeForm
                  key={unit.data.spek_saat_ini}
                  unitId={unit.data.id_unit}
                  defaultDate={new Date().toISOString().slice(0, 10)}
                  currentSpecs={unit.data.spek_saat_ini}
                  parts={parts.data.map((part) => ({
                    idPart: part.id_part,
                    name: part.jenis_part,
                    stock: part.stock_qty,
                    cost: part.modal_per_unit,
                  }))}
                />
              </details>
            )}
            {upgrades.data.length === 0 ? (
              <p className="mt-6 text-stone-500">Belum ada upgrade pada unit ini.</p>
            ) : (
              <div className="mt-6 divide-y divide-stone-100">
                {upgrades.data.map((upgrade) => (
                  <div className="flex items-start justify-between gap-4 py-4" key={upgrade.id_log}>
                    <div>
                      <p className="font-bold">
                        {upgrade.jenis === "downgrade" ? "Downgrade spek" : upgrade.id_part ?? "Jasa tanpa part"}
                      </p>
                      {upgrade.spek_setelah && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">Spek setelah: {upgrade.spek_setelah}</p>
                      )}
                      <p className="mt-1 text-sm text-stone-500">{upgrade.catatan ?? "Tanpa catatan"}</p>
                    </div>
                    <div className="text-right">
                      <p className={upgrade.jenis === "downgrade" ? "font-black text-red-700" : "font-black"}>
                        {upgrade.jenis === "downgrade" ? "−" : ""}{formatCurrency(upgrade.biaya)}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">{formatDate(upgrade.tanggal)}</p>
                      {(isAdmin || isTeknisi) && upgrade.jenis === "part" && upgrade.id_part && (
                        <DowngradePartButton unitId={unit.data.id_unit} logId={upgrade.id_log} partId={upgrade.id_part} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-6 text-center lg:sticky lg:top-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">QR unit</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mx-auto mt-4 aspect-square w-full max-w-64" src={`/api/units/${unit.data.id_unit}/qr`} alt={`QR ${unit.data.id_unit}`} />
          <p className="mt-3 font-mono text-sm font-bold">{unit.data.qr_payload}</p>
          <a className="mt-5 block rounded-xl bg-amber-700 px-4 py-3 font-bold text-white hover:bg-amber-800" href={`/api/units/${unit.data.id_unit}/qr`} target="_blank">
            Buka / cetak QR
          </a>
        </aside>
      </div>
    </main>
  );
}
