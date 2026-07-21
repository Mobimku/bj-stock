"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function StatusButton({
  id,
  nextStatus,
  listingPrice,
}: {
  id: string;
  nextStatus: string | null;
  listingPrice: number | string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/units/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingPrice: values.get("listingPrice") || undefined,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Status gagal diperbarui.");
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-5" onSubmit={advance}>
      {(nextStatus === "Listed" || nextStatus === null) && (
        <label className="mb-3 block text-sm font-bold text-stone-200">
          Harga listing
          <input
            className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-900 px-4 py-3 text-white outline-none focus:border-amber-400"
            name="listingPrice"
            type="number"
            min="1"
            step="1"
            defaultValue={listingPrice ?? ""}
            required
          />
        </label>
      )}
      <button
        className="w-full rounded-xl bg-white px-4 py-3 font-black text-stone-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Memperbarui..." : nextStatus ? `Lanjut ke ${nextStatus}` : "Ubah harga listing"}
      </button>
      {error && <p className="mt-2 text-sm text-red-300" role="alert">{error}</p>}
    </form>
  );
}
