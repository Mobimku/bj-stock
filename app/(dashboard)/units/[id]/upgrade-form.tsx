"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

type AvailablePart = {
  idPart: string;
  name: string;
  stock: number;
  cost: number | string;
};

export function UpgradeForm({
  unitId,
  parts,
  defaultDate,
  currentSpecs,
}: {
  unitId: string;
  parts: AvailablePart[];
  defaultDate: string;
  currentSpecs: string | null;
}) {
  const router = useRouter();
  const [type, setType] = useState<"part" | "service" | "downgrade">(parts.length ? "part" : "service");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/units/${unitId}/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date: values.get("date"),
          notes: values.get("notes"),
          ...(type === "part"
            ? { partId: values.get("partId") }
            : type === "service"
              ? { cost: values.get("cost") }
              : { cost: values.get("cost"), currentSpecs: values.get("currentSpecs") }),
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Upgrade gagal disimpan.");
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  const fieldClass =
    "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

  return (
    <form className="mt-5 grid gap-4 border-t border-stone-100 pt-5 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm font-bold text-stone-700">
        Jenis transaksi
        <select className={fieldClass} value={type} onChange={(event) => setType(event.target.value as typeof type)}>
          <option value="part" disabled={!parts.length}>Part dari Bank Stock</option>
          <option value="service">Jasa tanpa part</option>
          <option value="downgrade">Downgrade spek (kurangi modal)</option>
        </select>
      </label>
      <label className="text-sm font-bold text-stone-700">
        Tanggal
        <input className={fieldClass} name="date" type="date" defaultValue={defaultDate} required />
      </label>
      {type === "part" ? (
        <label className="text-sm font-bold text-stone-700 sm:col-span-2">
          Part tersedia
          <select className={fieldClass} name="partId" required>
            {parts.map((part) => (
              <option value={part.idPart} key={part.idPart}>
                {part.idPart} · {part.name} · stok {part.stock} · {formatCurrency(part.cost)}
              </option>
            ))}
          </select>
        </label>
      ) : type === "service" ? (
        <label className="text-sm font-bold text-stone-700 sm:col-span-2">
          Biaya jasa
          <input className={fieldClass} name="cost" type="number" min="0" step="1" required />
        </label>
      ) : (
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <label className="text-sm font-bold text-stone-700">
            Pengurangan modal
            <input className={fieldClass} name="cost" type="number" min="1" step="1" required />
          </label>
          <p className="self-end rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Part copotan tidak otomatis masuk Bank Stock. Catat terpisah bila masih layak dipakai.
          </p>
          <label className="text-sm font-bold text-stone-700 sm:col-span-2">
            Spek saat ini setelah downgrade
            <textarea className={fieldClass} name="currentSpecs" defaultValue={currentSpecs ?? ""} maxLength={2000} rows={4} required />
          </label>
        </div>
      )}
      <label className="text-sm font-bold text-stone-700 sm:col-span-2">
        Catatan
        <textarea className={fieldClass} name="notes" maxLength={1000} rows={2} />
      </label>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2" role="alert">{error}</p>}
      <div className="flex justify-end sm:col-span-2">
        <button className="rounded-lg bg-stone-950 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:opacity-60" type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : type === "downgrade" ? "Simpan downgrade" : "Tambah upgrade"}
        </button>
      </div>
    </form>
  );
}
