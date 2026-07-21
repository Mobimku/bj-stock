"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelServiceButton({ idServis }: { idServis: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCancel() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/service/${idServis}/cancel`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Gagal membatalkan service." }));
      setError(body.error);
      setLoading(false);
      return;
    }
    router.refresh();
    setOpen(false);
  }

  return (
    <>
      <button className="rounded-xl border-2 border-red-600 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50" onClick={() => setOpen(true)} type="button">Batalkan</button>
      {open && (
        <dialog className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 open:flex" open onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-lg font-black">Batalkan service order?</p>
            <p className="mt-2 text-sm text-stone-600">Part yang sudah terpakai akan dikembalikan ke Bank Stock, status servis menjadi <strong>Dibatalkan</strong>. Aksi ini tidak bisa dibatalkan.</p>
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-xl px-4 py-2 font-bold text-stone-600 hover:bg-stone-100" disabled={loading} onClick={() => setOpen(false)} type="button">Tutup</button>
              <button className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50" disabled={loading} onClick={handleCancel} type="button">{loading ? "Memproses..." : "Ya, batalkan"}</button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
