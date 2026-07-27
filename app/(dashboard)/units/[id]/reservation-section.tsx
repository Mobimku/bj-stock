"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { ReservationCompleteForm } from "./reservation-complete-form";

type Customer = { id: string; name: string; wa: string | null };
type ActiveReservation = { id: string; customerName: string; customerWa: string | null; dpAmount: number | string; agreedPrice: number | string; isRefundable: boolean; expiresAt: string };

export function ReservationSection({ unitId, unitStatus, listingPrice, isAdmin, isOwner, activeReservation, customers, defaultWarrantyDays }: {
  unitId: string; unitStatus: string; listingPrice: number | string | null; isAdmin: boolean; isOwner: boolean; activeReservation: ActiveReservation | null; customers: Customer[]; defaultWarrantyDays: number | null;
}) {
  const [showComplete, setShowComplete] = useState(false);
  if (unitStatus === "Dipesan" && activeReservation) {
    const overdue = new Date(activeReservation.expiresAt).getTime() < Date.now();
    return (
      <ReservationCard reservation={activeReservation} overdue={overdue} isAdmin={isAdmin} isOwner={isOwner} showComplete={showComplete} onShowComplete={() => setShowComplete(true)} onHideComplete={() => setShowComplete(false)}>
        {showComplete && <ReservationCompleteForm reservationId={activeReservation.id} defaultWarrantyDays={defaultWarrantyDays} overdue={overdue} />}
      </ReservationCard>
    );
  }
  if ((unitStatus === "Ready" || unitStatus === "Listed") && isAdmin) {
    return <ReservationCreateForm unitId={unitId} listingPrice={listingPrice} customers={customers} />;
  }
  return null;
}

function ReservationCard({ reservation, overdue, isAdmin, isOwner, showComplete, onShowComplete, onHideComplete, children }: {
  reservation: ActiveReservation; overdue: boolean; isAdmin: boolean; isOwner: boolean; showComplete: boolean; onShowComplete: () => void; onHideComplete: () => void; children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const remaining = Number(reservation.agreedPrice) - Number(reservation.dpAmount);

  async function refundReservation() {
    if (!confirm("Kembalikan DP ke customer? Reservasi akan dibatalkan.")) return;
    setPending("refund");
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/refund`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        const err = z.object({ error: z.string() }).safeParse(json);
        alert(err.success ? err.data.error : "Gagal refund.");
        return;
      }
      router.refresh();
    } catch { alert("Tidak dapat terhubung ke server."); } finally { setPending(""); }
  }

  async function forfeitReservation() {
    if (!confirm("Hanguskan DP? Tindakan ini tidak dapat dibatalkan.")) return;
    setPending("forfeit");
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/forfeit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        const err = z.object({ error: z.string() }).safeParse(json);
        alert(err.success ? err.data.error : "Gagal hanguskan DP.");
        return;
      }
      router.refresh();
    } catch { alert("Tidak dapat terhubung ke server."); } finally { setPending(""); }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Reservasi</p>
      <h2 className="mt-2 text-xl font-black">Reservasi (DP)</h2>
      <div className="mt-5 grid gap-4 border-t border-stone-200 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase text-stone-400">Customer</p>
          <p className="mt-1 font-bold text-stone-900">{reservation.customerName}</p>
          {reservation.customerWa && <p className="text-sm text-stone-500">{reservation.customerWa}</p>}
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-stone-400">Batas reservasi</p>
          <p className={`mt-1 font-bold ${overdue ? "text-red-700" : "text-stone-900"}`}>{formatDateTime(reservation.expiresAt)}</p>
          {overdue && <p className="mt-1 text-xs font-bold text-red-700">Terlewat</p>}
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-stone-400">DP</p>
          <p className="mt-1 font-bold text-stone-900">{formatCurrency(reservation.dpAmount)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-stone-400">Harga kesepakatan</p>
          <p className="mt-1 font-bold text-stone-900">{formatCurrency(reservation.agreedPrice)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-stone-400">Sisa pelunasan</p>
          <p className="mt-1 font-bold text-stone-500">{formatCurrency(remaining)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-stone-400">Syarat DP</p>
          <p className="mt-1 font-bold text-stone-900">
            {reservation.isRefundable ? <span className="text-emerald-700">Dapat dikembalikan</span> : <span className="text-red-700">Hangus bila batal</span>}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3 border-t border-stone-200 pt-5">
        {isAdmin && !overdue && !showComplete && (
          <button className="rounded-xl bg-[#198929] px-5 py-3 font-bold text-white hover:bg-[#147522]" type="button" onClick={onShowComplete}>Lunasi</button>
        )}
        {isAdmin && !overdue && showComplete && (
          <button className="rounded-xl border border-stone-300 px-5 py-3 font-bold text-stone-700" type="button" onClick={onHideComplete}>Batal lunasi</button>
        )}
        {isOwner && reservation.isRefundable && (
          <button className="rounded-xl border border-red-300 px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50" type="button" disabled={pending === "refund"} onClick={refundReservation}>
            {pending === "refund" ? "Memproses..." : "Refund DP"}
          </button>
        )}
        {isAdmin && !reservation.isRefundable && (
          <button className="rounded-xl border border-stone-300 px-5 py-3 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50" type="button" disabled={pending === "forfeit"} onClick={forfeitReservation}>
            {pending === "forfeit" ? "Memproses..." : "Hanguskan DP"}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ReservationCreateForm({ unitId, listingPrice, customers }: {
  unitId: string; listingPrice: number | string | null; customers: Customer[];
}) {
  const router = useRouter();
  const idempotencyKeyRef = useRef<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const fieldClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

  function defaultExpiry() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!customerId) { setError("Pilih customer terlebih dahulu."); return; }
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    const values = new FormData(event.currentTarget);
    const localExpiry = String(values.get("expiresAt") ?? "");
    setPending(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current, unitId, customerId,
          dpAmount: values.get("dpAmount"), agreedPrice: values.get("agreedPrice"),
          isRefundable: values.get("isRefundable") === "on",
          expiresAt: new Date(localExpiry).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = z.object({ error: z.string() }).safeParse(json);
        setError(err.success ? err.data.error : "Reservasi gagal dibuat.");
        return;
      }
      router.refresh();
    } catch { setError("Tidak dapat terhubung ke server."); } finally { setPending(false); }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Reservasi</p>
      <h2 className="mt-2 text-xl font-black">Reservasi (DP)</h2>
      <p className="mt-2 text-sm text-stone-600">Buat reservasi dengan DP untuk mengunci unit.</p>
      <form className="mt-5 grid gap-5 border-t border-stone-200 pt-5" onSubmit={submit}>
        <label className="text-sm font-bold text-stone-700">
          Pilih customer <span className="text-red-600">*</span>
          <select className={fieldClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">Pilih customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.wa ? ` · ${c.wa}` : ""}</option>)}
          </select>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold text-stone-700">
            Jumlah DP <span className="text-red-600">*</span>
            <input className={fieldClass} name="dpAmount" type="number" min="1" step="1" required />
          </label>
          <label className="text-sm font-bold text-stone-700">
            Harga kesepakatan <span className="text-red-600">*</span>
            <input className={fieldClass} name="agreedPrice" type="number" min="1" step="1" defaultValue={listingPrice ?? ""} required />
          </label>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-stone-50 p-4 text-sm text-stone-800">
          <input className="mt-1 size-5 shrink-0 accent-[#198929]" name="isRefundable" type="checkbox" defaultChecked />
          <span><strong>DP dapat dikembalikan.</strong> Centang jika DP bisa direfund bila batal.</span>
        </label>
        <label className="text-sm font-bold text-stone-700">
          Batas reservasi <span className="text-red-600">*</span>
          <input className={fieldClass} name="expiresAt" type="datetime-local" defaultValue={defaultExpiry()} required />
        </label>
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
        <button className="rounded-xl bg-[#198929] px-5 py-3 font-bold text-white hover:bg-[#147522] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Buat reservasi"}
        </button>
      </form>
    </section>
  );
}
