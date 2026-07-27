"use client";

const fieldClass =
  "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

export function DirectSaleDetails({
  listingPrice,
  defaultDate,
  defaultWarrantyDays,
}: {
  readonly listingPrice: number | string | null;
  readonly defaultDate: string;
  readonly defaultWarrantyDays: number;
}) {
  return (
    <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 sm:grid-cols-2">
      <h2 className="text-xl font-black sm:col-span-2">Detail penjualan langsung</h2>
      <label className="text-sm font-bold text-stone-700">
        Harga jual <span className="text-red-600">*</span>
        <input
          className={fieldClass}
          name="salePrice"
          type="number"
          min="1"
          step="1"
          defaultValue={listingPrice ?? ""}
          required
        />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Tanggal transaksi <span className="text-red-600">*</span>
        <input
          className={fieldClass}
          name="transactionDate"
          type="date"
          defaultValue={defaultDate}
          required
        />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Durasi garansi (hari) <span className="text-red-600">*</span>
        <input
          className={fieldClass}
          name="warrantyDays"
          type="number"
          min="1"
          step="1"
          defaultValue={defaultWarrantyDays}
          required
        />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Channel
        <select className={fieldClass} name="channel" defaultValue="Offline" required>
          <option>Offline</option>
          <option>Marketplace</option>
          <option>Instagram</option>
          <option>TikTok</option>
          <option>WA</option>
        </select>
      </label>
      <label className="text-sm font-bold text-stone-700">
        Metode bayar
        <select className={fieldClass} name="paymentMethod" defaultValue="Tunai" required>
          <option>Tunai</option>
          <option>Transfer</option>
          <option>Cicilan</option>
        </select>
      </label>
    </section>
  );
}
