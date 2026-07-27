"use client";

import type { UnitOption } from "./types";
import { formatCurrency } from "@/lib/format";

const fieldClass =
  "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

const cardClass =
  "flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-stone-200 px-4 py-3 text-center text-sm font-black has-checked:border-amber-700 has-checked:bg-amber-50 has-checked:text-amber-900 has-focus-visible:ring-2 has-focus-visible:ring-amber-600 has-focus-visible:ring-offset-2";

export function StepOnePrimitive({
  units,
  transactionType,
  onTransactionTypeChange,
  unitId,
  onUnitIdChange,
  selectedUnit,
}: {
  readonly units: readonly UnitOption[];
  readonly transactionType: "sale" | "reservation";
  readonly onTransactionTypeChange: (type: "sale" | "reservation") => void;
  readonly unitId: string;
  readonly onUnitIdChange: (id: string) => void;
  readonly selectedUnit: UnitOption | null;
}) {
  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-black">Unit</h2>
        <label className="mt-5 block text-sm font-bold text-stone-700">
          Pilih unit <span className="text-red-600">*</span>
          <select
            className={fieldClass}
            value={unitId}
            onChange={(e) => onUnitIdChange(e.target.value)}
            required
          >
            <option value="">Pilih unit</option>
            {units.map((u) => (
              <option value={u.id} key={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        {selectedUnit && (
          <div className="mt-4 rounded-2xl bg-stone-950 p-5 text-white md:hidden">
            <p className="font-mono text-sm font-bold text-amber-400">{selectedUnit.id}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">
              Model unit
            </p>
            <p className="mt-1 text-2xl font-black">{selectedUnit.label}</p>
            <div className="mt-4 border-t border-stone-800 pt-3">
              <p className="text-xs font-bold uppercase text-stone-500">Total modal terkunci</p>
              <p className="mt-1 text-xl font-black">{formatCurrency(selectedUnit.totalCapital)}</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-black">Jenis transaksi</h2>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className={cardClass}>
            <input
              className="sr-only"
              type="radio"
              name="transactionType"
              value="sale"
              checked={transactionType === "sale"}
              onChange={() => onTransactionTypeChange("sale")}
            />
            Penjualan langsung
          </label>
          <label className={cardClass}>
            <input
              className="sr-only"
              type="radio"
              name="transactionType"
              value="reservation"
              checked={transactionType === "reservation"}
              onChange={() => onTransactionTypeChange("reservation")}
            />
            Reservasi (DP)
          </label>
        </div>
      </section>
    </div>
  );
}
