"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function UnitForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const fd = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {};
    fd.forEach((value, key) => {
      data[key] = value;
    });

    try {
      const response = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = (await response.json()) as { idUnit?: string; error?: string };

      if (!response.ok || !result.idUnit) {
        setError(result.error ?? "Unit gagal disimpan.");
        return;
      }
      router.push(`/units/${result.idUnit}`);
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  const fieldClass =
    "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

  return (
    <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
      <label className="text-sm font-bold text-stone-700">
        Brand <span className="text-red-600">*</span>
        <input className={fieldClass} name="brand" maxLength={50} required />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Model
        <input className={fieldClass} name="model" maxLength={100} />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Serial number
        <input className={fieldClass} name="serialNumber" maxLength={100} />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Kondisi fisik <span className="text-red-600">*</span>
        <select className={fieldClass} name="physicalCondition" defaultValue="B" required>
          <option value="A">Grade A</option>
          <option value="B">Grade B</option>
          <option value="C">Grade C</option>
        </select>
      </label>
      <label className="text-sm font-bold text-stone-700 md:col-span-2">
        Spesifikasi awal
        <textarea className={fieldClass} name="initialSpecs" maxLength={2000} rows={3} />
      </label>
      <label className="text-sm font-bold text-stone-700 md:col-span-2">
        Kondisi fungsi
        <textarea className={fieldClass} name="functionalCondition" maxLength={2000} rows={3} />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Sumber beli
        <input className={fieldClass} name="purchaseSource" maxLength={200} />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Tanggal masuk <span className="text-red-600">*</span>
        <input className={fieldClass} name="entryDate" type="date" defaultValue={defaultDate} required />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Modal awal <span className="text-red-600">*</span>
        <input className={fieldClass} name="initialCapital" type="number" min="1" step="1" required />
      </label>
      <p className="text-xs text-stone-500 md:col-span-2">Foto bisa ditambahkan setelah unit disimpan, di halaman detail unit.</p>
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end md:col-span-2">
        <button
          className="rounded-xl bg-stone-950 px-6 py-3 font-bold text-white hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={pending}
        >
          {pending ? "Menyimpan..." : "Simpan unit"}
        </button>
      </div>
    </form>
  );
}