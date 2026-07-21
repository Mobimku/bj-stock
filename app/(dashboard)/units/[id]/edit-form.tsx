"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type SpecData = {
  id_unit: string;
  brand: string;
  model: string | null;
  spek_saat_ini: string | null;
  kondisi_fisik: string | null;
  kondisi_fungsi: string | null;
};

type Props = {
  unit: SpecData;
  open: boolean;
  onClose: () => void;
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 outline-none focus:border-amber-500";

function lockBackgroundScroll() {
  const body = document.body;
  const content = document.querySelector<HTMLElement>(".dashboard-content");
  const scrollY = window.scrollY;

  body.dataset.modalScrollY = String(scrollY);
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.inset = "0";
  body.style.width = "100%";

  if (content) {
    content.dataset.modalOverflow = content.style.overflow;
    content.style.overflow = "hidden";
  }
}

function unlockBackgroundScroll() {
  const body = document.body;
  const content = document.querySelector<HTMLElement>(".dashboard-content");
  const scrollY = Number(body.dataset.modalScrollY ?? "0");

  body.style.overflow = "";
  body.style.position = "";
  body.style.inset = "";
  body.style.width = "";
  delete body.dataset.modalScrollY;
  window.scrollTo(0, scrollY);

  if (content) {
    content.style.overflow = content.dataset.modalOverflow ?? "";
    delete content.dataset.modalOverflow;
  }
}

export function EditUnitForm({ unit, open, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
      lockBackgroundScroll();
    } else if (dialog.open) {
      dialog.close();
    }

    return () => {
      unlockBackgroundScroll();
    };
  }, [open]);

  function handleClose() {
    setError("");
    unlockBackgroundScroll();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const payload: Record<string, string | null> = {};
    const brand = (data.get("brand") as string | null)?.trim() ?? "";
    if (brand) payload.brand = brand;
    const model = (data.get("model") as string | null)?.trim() ?? "";
    payload.model = model || null;
    const spek = (data.get("spek_saat_ini") as string | null)?.trim() ?? "";
    payload.spek_saat_ini = spek || null;
    const kf = data.get("kondisi_fisik") as string | null;
    if (kf) payload.kondisi_fisik = kf;
    const kondisiFungsi = (data.get("kondisi_fungsi") as string | null)?.trim() ?? "";
    payload.kondisi_fungsi = kondisiFungsi || null;

    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/units/${unit.id_unit}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Gagal menyimpan perubahan.");
        return;
      }
      handleClose();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) handleClose();
      }}
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 open:flex open:items-end open:justify-center open:sm:items-center [&:not([open])]:hidden"
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden />

      <form
        className="relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:mx-4 sm:rounded-2xl"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-stone-100 px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-stone-900">Edit unit</h2>
            <button
              type="button"
              onClick={handleClose}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Brand & model bisa dikoreksi (typo). ID unit ({unit.id_unit}) tidak berubah. Spek awal tetap snapshot create.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-stone-700">
              Brand
              <input
                className={fieldClass}
                name="brand"
                defaultValue={unit.brand}
                maxLength={50}
                required
                autoFocus
              />
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Model
              <input
                className={fieldClass}
                name="model"
                defaultValue={unit.model ?? ""}
                maxLength={100}
              />
            </label>
          </div>
          <label className="block text-sm font-bold text-stone-700">
            Spesifikasi saat ini
            <textarea
              className={fieldClass}
              name="spek_saat_ini"
              defaultValue={unit.spek_saat_ini ?? ""}
              rows={4}
              maxLength={2000}
            />
          </label>
          <label className="block text-sm font-bold text-stone-700">
            Kondisi fisik
            <select
              className={fieldClass}
              name="kondisi_fisik"
              defaultValue={unit.kondisi_fisik ?? "B"}
              required
            >
              <option value="A">Grade A</option>
              <option value="B">Grade B</option>
              <option value="C">Grade C</option>
            </select>
          </label>
          <label className="block text-sm font-bold text-stone-700">
            Kondisi fungsi
            <textarea
              className={fieldClass}
              name="kondisi_fungsi"
              defaultValue={unit.kondisi_fungsi ?? ""}
              rows={4}
              maxLength={2000}
            />
          </label>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-stone-100 px-5 py-4 sm:px-6">
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
              className="flex-1 rounded-xl bg-amber-600 px-4 py-3 font-black text-stone-950 hover:bg-amber-500 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
