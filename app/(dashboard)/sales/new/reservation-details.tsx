"use client";

import { formatCurrency } from "@/lib/format";
import type { UnitOption } from "./types";

type WibResult = { ok: true; value: string } | { ok: false; error: string };

const fieldClass =
  "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

/** Validates a `YYYY-MM-DDTHH:mm` shape and returns
 * `YYYY-MM-DDTHH:mm:00+07:00` without Date timezone reinterpretation. */
export function serializeWibExpiry(datetimeLocal: string): WibResult {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datetimeLocal)) {
    return { ok: false, error: `Format tanggal tidak valid: ${datetimeLocal}` };
  }
  return { ok: true, value: `${datetimeLocal}:00+07:00` };
}

function defaultWibExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export function ReservationDetails({
  selectedUnit,
}: {
  readonly selectedUnit: Pick<UnitOption, "listingPrice"> | null;
}) {
  const listingPrice = selectedUnit?.listingPrice ?? null;

  return (
    <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 sm:grid-cols-2">
      <h2 className="text-xl font-black sm:col-span-2">Detail reservasi</h2>
      <label className="text-sm font-bold text-stone-700">
        Jumlah DP <span className="text-red-600">*</span>
        <input className={fieldClass} name="dpAmount" type="number" min="1" step="1" required />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Harga disepakati <span className="text-red-600">*</span>
        <input
          className={fieldClass}
          name="agreedPrice"
          type="number"
          min="1"
          step="1"
          defaultValue={listingPrice ?? ""}
          required
        />
        {listingPrice !== null && (
          <span className="mt-1 block text-xs text-stone-500">
            Listing: {formatCurrency(listingPrice)}
          </span>
        )}
      </label>
      <label className="col-span-2 flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-stone-800">
        <input
          className="size-5 accent-amber-700"
          name="refundable"
          type="checkbox"
          defaultChecked
        />
        <span>
          <strong>Refundable.</strong> DP dapat dikembalikan jika reservasi
          dibatalkan dalam waktu yang disepakati.
        </span>
      </label>
      <label className="col-span-2 text-sm font-bold text-stone-700">
        Batas waktu reservasi <span className="text-red-600">*</span>
        <input
          className={fieldClass}
          name="wibExpiry"
          type="datetime-local"
          defaultValue={defaultWibExpiry()}
          required
        />
        <span className="mt-1 block text-xs text-stone-500">
          Waktu dalam WIB (Asia/Jakarta).
        </span>
      </label>
    </section>
  );
}
