"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { BankPart } from "@/lib/validation/bank-stock";

export function PartForm({ part }: { part?: BankPart }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(part);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError("");

    try {
      const response = await fetch(editing ? `/api/bank-stock/${part?.id_part}` : "/api/bank-stock", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partType: values.get("partType"),
          condition: values.get("condition"),
          unitCost: values.get("unitCost"),
          source: values.get("source"),
          ...(editing
            ? { stockAddition: values.get("stockAddition") }
            : { stockQuantity: values.get("stockQuantity") }),
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Part gagal disimpan.");
        return;
      }
      if (!editing) form.reset();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!part || !window.confirm(`Hapus ${part.id_part}?`)) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/bank-stock/${part.id_part}`, { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setError(result.error ?? "Part gagal dihapus.");
        return;
      }
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
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm font-bold text-stone-700">
        Jenis part
        <input className={fieldClass} name="partType" defaultValue={part?.jenis_part} maxLength={100} required />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Kondisi
        <select className={fieldClass} name="condition" defaultValue={part?.kondisi ?? "Copotan"} required>
          <option value="New">New</option>
          <option value="Copotan">Copotan</option>
        </select>
      </label>
      <label className="text-sm font-bold text-stone-700">
        {editing ? "Tambah stok" : "Stok awal"}
        <input
          className={fieldClass}
          name={editing ? "stockAddition" : "stockQuantity"}
          type="number"
          min="0"
          step="1"
          defaultValue="0"
          required
        />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Modal per unit
        <input className={fieldClass} name="unitCost" type="number" min="0" step="1" defaultValue={part?.modal_per_unit} required />
      </label>
      <label className="text-sm font-bold text-stone-700 sm:col-span-2">
        Sumber
        <input className={fieldClass} name="source" defaultValue={part?.sumber ?? ""} maxLength={200} />
      </label>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3 sm:col-span-2">
        {editing && (
          <button className="rounded-lg px-4 py-2 font-bold text-red-700 hover:bg-red-50" type="button" onClick={remove} disabled={pending}>
            Hapus
          </button>
        )}
        <button className="rounded-lg bg-stone-950 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:opacity-60" type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : editing ? "Simpan / restock" : "Tambah part"}
        </button>
      </div>
    </form>
  );
}
