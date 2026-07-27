"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

type Props = {
  reservationId: string;
  isRefundable: boolean;
  role: string;
};

export function ReservationActions({ reservationId, isRefundable, role }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  async function refund() {
    if (!confirm("Kembalikan DP ke customer? Reservasi akan dibatalkan.")) return;
    setPending("refund");
    setError("");
    try {
      const res = await fetch(`/api/reservations/${reservationId}/refund`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        const err = z.object({ error: z.string() }).safeParse(json);
        setError(err.success ? err.data.error : "Gagal refund.");
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending("");
    }
  }

  async function forfeit() {
    if (!confirm("Hanguskan DP? Tindakan ini tidak dapat dibatalkan.")) return;
    setPending("forfeit");
    setError("");
    try {
      const res = await fetch(`/api/reservations/${reservationId}/forfeit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        const err = z.object({ error: z.string() }).safeParse(json);
        setError(err.success ? err.data.error : "Gagal hanguskan DP.");
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending("");
    }
  }

  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";

  return (
    <>
      {isOwner && isRefundable && (
        <button
          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          type="button"
          disabled={pending === "refund"}
          onClick={refund}
        >
          {pending === "refund" ? "Memproses..." : "Refund"}
        </button>
      )}
      {isAdmin && !isRefundable && (
        <button
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          type="button"
          disabled={pending === "forfeit"}
          onClick={forfeit}
        >
          {pending === "forfeit" ? "Memproses..." : "Hanguskan"}
        </button>
      )}
      {error && <p className="col-span-full mt-1 text-xs text-red-600">{error}</p>}
    </>
  );
}
