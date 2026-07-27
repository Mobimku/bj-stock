"use client";

import { normalizeWhatsapp } from "@/lib/validation/whatsapp";
import type { Customer } from "./types";

const fieldClass =
  "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

export function CustomerFields({
  customerId,
  onCustomerIdChange,
  customers,
}: {
  readonly customerId: string;
  readonly onCustomerIdChange: (id: string) => void;
  readonly customers: readonly Customer[];
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-xl font-black">Customer</h2>
      <label className="mt-5 block text-sm font-bold text-stone-700">
        Pilih customer tersimpan
        <select
          className={fieldClass}
          value={customerId}
          onChange={(e) => onCustomerIdChange(e.target.value)}
        >
          <option value="">Customer baru</option>
          {customers.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
              {c.wa ? ` · ${c.wa}` : ""}
            </option>
          ))}
        </select>
      </label>

      {!customerId && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold text-stone-700">
            Nama <span className="text-red-600">*</span>
            <input className={fieldClass} name="customerName" maxLength={100} required />
          </label>
          <label className="text-sm font-bold text-stone-700">
            Nomor WA
            <input
              className={fieldClass}
              name="customerWa"
              inputMode="tel"
              maxLength={40}
              placeholder="628123456789"
              onBlur={(e) => {
                const next = normalizeWhatsapp(e.currentTarget.value);
                if (next) e.currentTarget.value = next;
              }}
            />
          </label>
          <label className="text-sm font-bold text-stone-700">
            Segmen
            <select className={fieldClass} name="customerSegment" defaultValue="">
              <option value="">Belum ditentukan</option>
              <option>Pelajar</option>
              <option>Orang Tua</option>
              <option>Remote Worker</option>
              <option>Lainnya</option>
            </select>
          </label>
          <label className="text-sm font-bold text-stone-700">
            Sumber lead
            <select className={fieldClass} name="customerSource" defaultValue="">
              <option value="">Belum ditentukan</option>
              <option>TikTok</option>
              <option>Reels</option>
              <option>Instagram</option>
              <option>Facebook Marketplace</option>
              <option>WA</option>
              <option>Referral</option>
              <option>Lainnya</option>
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
