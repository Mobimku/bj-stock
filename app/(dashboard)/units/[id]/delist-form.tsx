"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function DelistButton({ id }: { id: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleClose() {
    setOpen(false);
    setError("");
    setConfirm(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const jenis = data.get("jenis") as string;
    const alasan = data.get("alasan") as string;

    if (jenis === "salah_input" && !confirm) {
      setConfirm(true);
      return;
    }

    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/units/${id}/delist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jenis, alasan }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Delist gagal.");
        setConfirm(false);
        return;
      }
      handleClose();
      if (jenis === "salah_input") {
        router.push("/units");
      } else {
        router.refresh();
      }
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-red-700 px-5 py-3 font-bold text-red-700 hover:bg-red-50"
      >
        Delist unit
      </button>

      <dialog
        ref={dialogRef}
        onClose={handleClose}
        onClick={(e) => {
          if (e.target === dialogRef.current) handleClose();
        }}
        className="fixed inset-0 z-50 m-0 flex h-full w-full max-h-full max-w-full items-center justify-center bg-black/60 p-4 backdrop:bg-black/40 [&:not([open])]:hidden"
      >
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-red-700">Delist Unit</h2>
            <button
              type="button"
              onClick={handleClose}
              className="flex size-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Unit akan dikeluarkan dari stok aktif. Tidak bisa dihapus bila ada servis aktif.
          </p>

          <form className="mt-5 grid gap-4" onSubmit={submit}>
            <label className="block text-sm font-bold text-stone-700">
              Jenis delist
              <select
                className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-red-500"
                name="jenis"
                required
                defaultValue=""
              >
                <option value="" disabled>Pilih jenis…</option>
                <option value="rusak">Rusak parah / tidak bisa diperbaiki</option>
                <option value="retur_supplier">Retur ke supplier (refund)</option>
                <option value="salah_input">Salah input (hapus permanen)</option>
                <option value="hilang">Hilang / dicuri</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Alasan
              <textarea
                className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-red-500"
                name="alasan"
                rows={3}
                maxLength={500}
                required
                placeholder="Jelaskan alasan delist…"
              />
            </label>

            {confirm && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <p className="text-sm font-bold text-red-900">
                  ⚠️ Peringatan: unit akan DIHAPUS PERMANEN
                </p>
                <p className="mt-1 text-sm text-red-700">
                  Beserta upgrade log, foto, dan semua riwayat. Aksi ini tidak dapat dibatalkan.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl border border-stone-300 px-4 py-3 font-bold text-stone-700 hover:bg-stone-100"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pending}
                className={[
                  "flex-1 rounded-xl px-4 py-3 font-black text-white disabled:cursor-wait disabled:opacity-60",
                  confirm ? "bg-red-700 hover:bg-red-800" : "bg-red-600 hover:bg-red-700",
                ].join(" ")}
              >
                {pending ? "Memproses..." : confirm ? "Konfirmasi hapus permanen" : "Delist unit"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

export function ReactivateButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function reactivate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/units/${id}/reactivate`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Reactivate gagal.");
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
    <div className="mt-5">
      <button
        className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-black text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
        type="button"
        disabled={pending}
        onClick={reactivate}
      >
        {pending ? "Memproses..." : "Reactivate ke Ready"}
      </button>
      {error && <p className="mt-2 text-sm text-red-300" role="alert">{error}</p>}
    </div>
  );
}
