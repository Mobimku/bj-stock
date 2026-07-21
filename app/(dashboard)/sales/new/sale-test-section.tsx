"use client";

import { useState } from "react";
import {
  SALE_TEST_ACKNOWLEDGEMENT,
  SALE_TEST_BLOCKERS,
  SALE_TEST_CATEGORIES,
  SALE_TEST_STATUSES,
  type SaleTestBlockerKey,
  type SaleTestStatus,
} from "../sale-test-contract";

type BlockingAnswers = Record<SaleTestBlockerKey, boolean | null>;

const INITIAL_BLOCKING_ANSWERS: BlockingAnswers = {
  identity_mismatch: null,
  serial_mismatch: null,
  spec_mismatch: null,
  swollen_battery: null,
  bios_lock: null,
  mdm_lock: null,
  unsafe_charger: null,
};

export function SaleTestSection({ onBlockedChange }: { readonly onBlockedChange: (blocked: boolean) => void }) {
  const [blockingAnswers, setBlockingAnswers] = useState(INITIAL_BLOCKING_ANSWERS);
  const blocked = Object.values(blockingAnswers).some((answer) => answer === true);

  function answerBlocker(key: SaleTestBlockerKey, answer: boolean) {
    const next = { ...blockingAnswers, [key]: answer };
    setBlockingAnswers(next);
    onBlockedChange(Object.values(next).some((value) => value === true));
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Sebelum pembayaran</p>
      <h2 className="mt-2 text-xl font-black">Pengujian unit</h2>
      <p className="mt-2 text-sm text-stone-600">Lengkapi seluruh hasil dan tinjau bersama pembeli sebelum transaksi dikonfirmasi.</p>

      <div className="mt-6 grid gap-4">
        {SALE_TEST_CATEGORIES.map((category, index) => (
          <TestCategoryField index={index + 1} key={category.key} category={category} />
        ))}
      </div>

      <div className="mt-8 border-t border-stone-200 pt-6">
        <h3 className="font-black">Pemeriksaan blocker</h3>
        <p className="mt-1 text-sm text-stone-600">Jawab Ya atau Tidak untuk setiap temuan. Satu jawaban Ya memblokir penjualan.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SALE_TEST_BLOCKERS.map((item) => (
            <fieldset className="min-w-0 rounded-xl border border-stone-200 p-4" key={item.key}>
              <legend className="px-1 text-sm font-bold text-stone-800">{item.label}</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <BlockerOption itemKey={item.key} label="Ya" value="yes" onChange={() => answerBlocker(item.key, true)} />
                <BlockerOption itemKey={item.key} label="Tidak" value="no" onChange={() => answerBlocker(item.key, false)} />
              </div>
              {blockingAnswers[item.key] === true && <p className="mt-3 text-xs font-bold text-red-700">Temuan ini harus diselesaikan sebelum penjualan.</p>}
            </fieldset>
          ))}
        </div>
        {blocked && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800" role="alert">
            Penjualan diblokir. Selesaikan semua temuan blocker dan ubah jawabannya menjadi Tidak.
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-5 border-t border-stone-200 pt-6">
        <label className="text-sm font-bold text-stone-700">
          Lokasi pengujian <span className="text-red-600">*</span>
          <input className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20" name="testLocation" defaultValue="Toko BJ Laptop, Bangunjiwo" maxLength={120} required />
        </label>
        <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-stone-800">
          <input className="mt-1 size-5 shrink-0 accent-amber-700" name="buyerAcknowledged" type="checkbox" required />
          <span><strong>Persetujuan pembeli.</strong> {SALE_TEST_ACKNOWLEDGEMENT}</span>
        </label>
      </div>
    </section>
  );
}

function TestCategoryField({ category, index }: { readonly category: (typeof SALE_TEST_CATEGORIES)[number]; readonly index: number }) {
  const [status, setStatus] = useState<SaleTestStatus | null>(null);
  const needsNote = status === "Ada Catatan" || status === "Tidak Diuji";

  return (
    <fieldset className="min-w-0 rounded-xl border border-stone-200 p-4">
      <legend className="px-1 text-sm font-black text-stone-900"><span className="mr-2 text-amber-700">{index}.</span>{category.label}</legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SALE_TEST_STATUSES.map((option) => (
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-stone-200 px-2 py-3 text-center text-xs font-bold has-checked:border-amber-700 has-checked:bg-amber-50 has-checked:text-amber-900 has-focus-visible:ring-2 has-focus-visible:ring-amber-600 has-focus-visible:ring-offset-2" key={option}>
            <input className="sr-only" name={`test.${category.key}.status`} type="radio" value={option} required onChange={() => setStatus(option)} />
            {option}
          </label>
        ))}
      </div>
      {status && (
        <label className="mt-3 block text-xs font-bold text-stone-700">
          {status === "Tidak Diuji" ? "Alasan tidak diuji" : "Catatan hasil"} {needsNote ? <span className="text-red-600">*</span> : <span className="font-medium text-stone-500">(opsional)</span>}
          <textarea className="mt-2 w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20" name={`test.${category.key}.note`} rows={2} maxLength={160} required={needsNote} />
        </label>
      )}
    </fieldset>
  );
}

function BlockerOption({ itemKey, label, value, onChange }: { readonly itemKey: SaleTestBlockerKey; readonly label: string; readonly value: "yes" | "no"; readonly onChange: () => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-stone-200 px-3 py-2 text-sm font-bold has-checked:border-stone-950 has-checked:bg-stone-950 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-amber-600 has-focus-visible:ring-offset-2">
      <input className="sr-only" name={`blocker.${itemKey}`} type="radio" value={value} required onChange={onChange} />
      {label}
    </label>
  );
}
