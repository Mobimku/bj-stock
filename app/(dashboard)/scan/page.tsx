
import { Scanner, type ScanPurpose } from "./scanner";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const purpose: ScanPurpose = params.purpose === "sale" || params.purpose === "warranty" || params.purpose === "service"
    ? params.purpose
    : "unit";
  const descriptions = {
    unit: "Hasil scan langsung membuka riwayat unit.",
    sale: "Hasil scan membuka form penjualan bila unit berstatus Ready atau Listed.",
    warranty: "Hasil scan membuka status garansi dan riwayat klaim.",
    service: "Hasil scan membuka form penerimaan servis untuk unit BJ Laptop.",
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Lookup cepat</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">Scan QR unit</h1>
      <p className="mb-8 mt-2 text-stone-600">{descriptions[purpose]}</p>
      <Scanner purpose={purpose} />
    </main>
  );
}
