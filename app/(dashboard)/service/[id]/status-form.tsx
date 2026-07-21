"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const nextStatus = {
  Diterima: "Diagnosa",
  Diagnosa: "Dikerjakan",
  Dikerjakan: "Selesai",
  Selesai: "Diambil",
} as const;

type ServiceStatus = keyof typeof nextStatus | "Diambil";

export function StatusForm({
  id,
  status,
  role,
  defaultEstimatedCompletion,
}: {
  id: string;
  status: ServiceStatus;
  role: string;
  defaultEstimatedCompletion: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const target = status === "Diambil" ? null : nextStatus[status];
  const fieldClass =
    "mt-2 w-full rounded-xl border border-[#dde5de] bg-white px-4 py-3 outline-none focus:border-[#198929] focus:ring-2 focus:ring-[#198929]/20";

  if (!target || (target === "Diambil" && !["admin", "owner"].includes(role))) {
    return status === "Selesai" && !["admin", "owner"].includes(role)
      ? <p className="rounded-xl bg-[#ffdc50]/35 p-4 text-sm font-bold">Menunggu admin atau owner menyerahkan perangkat kepada customer.</p>
      : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/service/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStatus: target,
          diagnosis: values.get("diagnosis") ?? "",
          action: values.get("action") ?? "",
          serviceFee: target === "Selesai" ? Number(values.get("serviceFee")) : null,
          estimatedCompletion: values.get("estimatedCompletion") ?? "",
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Status servis gagal diperbarui.");
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
    <form className="rounded-2xl border border-[#dde5de] bg-white p-6" onSubmit={submit}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff751f]">Tahap berikutnya</p>
      <h2 className="mt-2 text-2xl font-black">{target}</h2>
      {target === "Diagnosa" && (
        <label className="mt-5 block text-sm font-bold">
          Hasil diagnosa
          <textarea className={fieldClass} name="diagnosis" rows={4} maxLength={2000} required />
        </label>
      )}
      {target === "Dikerjakan" && (
        <label className="mt-5 block text-sm font-bold">
          Tindakan yang dilakukan
          <textarea className={fieldClass} name="action" rows={4} maxLength={2000} required />
        </label>
      )}
      {target === "Selesai" && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold">
            Biaya jasa
            <input className={fieldClass} name="serviceFee" type="number" min="0" step="1" defaultValue="0" required />
          </label>
          <label className="text-sm font-bold">
            Estimasi selesai
            <input className={fieldClass} name="estimatedCompletion" type="date" defaultValue={defaultEstimatedCompletion} />
          </label>
        </div>
      )}
      {target === "Diambil" && <p className="mt-4 text-sm text-[#5e6b61]">Konfirmasi perangkat sudah diserahkan. Garansi servis dimulai hari ini.</p>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-[#c62828]" role="alert">{error}</p>}
      <button className={`mt-5 w-full rounded-xl px-5 py-3 font-black text-white disabled:bg-stone-400 ${target === "Diambil" ? "bg-[#ff751f] hover:bg-[#d85b0b]" : "bg-[#198929] hover:bg-[#147522]"}`} type="submit" disabled={pending}>
        {pending ? "Memproses..." : `Ubah status ke ${target}`}
      </button>
    </form>
  );
}
