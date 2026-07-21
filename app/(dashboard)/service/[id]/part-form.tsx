"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

type Part = { id: string; name: string; stock: number; cost: number | string };

export function ServicePartForm({ id, parts, defaultDate }: { id: string; parts: Part[]; defaultDate: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/service/${id}/part`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId: values.get("partId"), date: values.get("date") }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Part gagal ditambahkan.");
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

  if (parts.length === 0) {
    return <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-[#c62828]">Tidak ada part dengan stok tersedia.</p>;
  }

  return (
    <form className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end" onSubmit={submit}>
      <label className="text-sm font-bold">
        Part dari Bank Stock
        <select className="mt-2 w-full rounded-xl border border-[#dde5de] bg-white px-4 py-3" name="partId" required defaultValue="">
          <option value="" disabled>Pilih part</option>
          {parts.map((part) => (
            <option value={part.id} key={part.id}>{part.name} · stok {part.stock} · {formatCurrency(part.cost)}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-bold">
        Tanggal
        <input className="mt-2 w-full rounded-xl border border-[#dde5de] px-4 py-3" name="date" type="date" defaultValue={defaultDate} required />
      </label>
      <button className="rounded-xl bg-[#ff751f] px-5 py-3 font-black text-white hover:bg-[#d85b0b] disabled:bg-stone-400" type="submit" disabled={pending}>
        {pending ? "Menambah..." : "Pakai part"}
      </button>
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-[#c62828] sm:col-span-3" role="alert">{error}</p>}
    </form>
  );
}
