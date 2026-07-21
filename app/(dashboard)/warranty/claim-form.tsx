"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ClaimForm({ unitId, defaultDate }: { unitId: string; defaultDate: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const fieldClass =
    "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/warranty/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          date: values.get("date"),
          complaint: values.get("complaint"),
          action: values.get("action"),
          cost: values.get("cost"),
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Klaim gagal disimpan.");
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

  return (
    <form className="mt-5 grid gap-5 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm font-bold text-stone-700">
        Tanggal klaim
        <input className={fieldClass} name="date" type="date" defaultValue={defaultDate} required />
      </label>
      <label className="text-sm font-bold text-stone-700">
        Biaya di luar garansi
        <input className={fieldClass} name="cost" type="number" min="0" step="1" defaultValue="0" required />
      </label>
      <label className="text-sm font-bold text-stone-700 sm:col-span-2">
        Keluhan
        <textarea className={fieldClass} name="complaint" rows={3} maxLength={2000} required />
      </label>
      <label className="text-sm font-bold text-stone-700 sm:col-span-2">
        Tindakan
        <textarea className={fieldClass} name="action" rows={3} maxLength={2000} />
      </label>
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:col-span-2" role="alert">{error}</p>}
      <div className="sm:col-span-2 sm:text-right">
        <button className="rounded-xl bg-stone-950 px-5 py-3 font-bold text-white hover:bg-amber-700 disabled:opacity-60" type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Catat klaim"}
        </button>
      </div>
    </form>
  );
}
