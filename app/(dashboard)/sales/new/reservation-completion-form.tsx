"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatCurrency } from "@/lib/format";
import { saleUnitTestSchema } from "@/lib/validation/sales";
import { SaleTestSection } from "./sale-test-section";
import { buildSaleTestPayload } from "./sale-test-payload";

const fieldClass =
  "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

const responseSchema = z.object({ idInvoice: z.string().optional(), error: z.string().optional() });

type CompletionReservation = {
  readonly id: string;
  readonly unit: { readonly id: string; readonly label: string; readonly totalCapital: number | string; readonly listingPrice: number | string | null };
  readonly customer: { readonly id: string; readonly name: string; readonly wa: string | null };
  readonly dpAmount: number;
  readonly agreedPrice: number;
  readonly expiresAt: string;
  readonly isRefundable: boolean;
};

export function ReservationCompletionForm({
  reservation,
  defaultWarrantyDays,
}: {
  readonly reservation: CompletionReservation;
  readonly defaultWarrantyDays: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const balance = reservation.agreedPrice - reservation.dpAmount;
  const expired = new Date(reservation.expiresAt).getTime() <= Date.now();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError("");
    if (expired) { setError("Reservasi sudah melewati batas waktu dan tidak dapat dilunasi."); return; }
    if (blocked) { setError("Pelunasan diblokir karena masih ada temuan pada pemeriksaan blocker."); return; }
    const unitTest = saleUnitTestSchema.safeParse(buildSaleTestPayload(values));
    if (!unitTest.success) { setError(unitTest.error.issues[0]?.message ?? "Pengujian unit belum lengkap."); return; }
    setPending(true);
    try {
      const response = await fetch(`/api/reservations/${reservation.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitTest: unitTest.data,
          paymentMethod: values.get("paymentMethod"),
          channel: values.get("channel"),
          transactionDate: values.get("transactionDate"),
          warrantyDays: values.get("warrantyDays"),
        }),
      });
      const result = responseSchema.safeParse(await response.json());
      if (!response.ok || !result.success || !result.data.idInvoice) {
        setError(result.success ? result.data.error ?? "Pelunasan gagal diproses." : "Respons server tidak valid.");
        return;
      }
      router.push(`/sales/${result.data.idInvoice}`);
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <section className="rounded-2xl bg-stone-950 p-6 text-white">
        <p className="font-mono text-sm font-bold text-amber-400">{reservation.unit.id}</p>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Model unit</p>
        <h2 className="mt-2 text-2xl font-black">{reservation.unit.label}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="border-t border-stone-800 pt-4">
            <p className="text-xs font-bold uppercase text-stone-500">Total modal terkunci</p>
            <p className="mt-1 text-xl font-black">{formatCurrency(reservation.unit.totalCapital)}</p>
          </div>
          <div className="border-t border-stone-800 pt-4">
            <p className="text-xs font-bold uppercase text-stone-500">Harga listing</p>
            <p className="mt-1 text-xl font-black">{reservation.unit.listingPrice ? formatCurrency(reservation.unit.listingPrice) : "Belum diatur"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-black">Ringkasan reservasi</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-stone-500">Customer</p>
            <p className="mt-1 font-bold">{reservation.customer.name}</p>
            {reservation.customer.wa && <p className="text-sm text-stone-500">{reservation.customer.wa}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-stone-500">Batas reservasi</p>
            <p className="mt-1 font-bold">{new Date(reservation.expiresAt).toLocaleDateString("id-ID", { dateStyle: "long" })}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-stone-500">DP dibayar</p>
            <p className="mt-1 font-bold">{formatCurrency(reservation.dpAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-stone-500">Sisa pelunasan</p>
            <p className="mt-1 text-xl font-black text-amber-700">{formatCurrency(balance)}</p>
          </div>
        </div>
        {reservation.isRefundable && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-stone-700">DP refundable.</p>}
        {expired && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">Reservasi sudah melewati batas waktu. Pelunasan tidak dapat diproses.</p>}
      </section>

      <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 sm:grid-cols-2">
        <h2 className="text-xl font-black sm:col-span-2">Detail pelunasan</h2>
        <label className="text-sm font-bold text-stone-700">
          Tanggal transaksi <span className="text-red-600">*</span>
          <input className={fieldClass} name="transactionDate" type="date" required />
        </label>
        <label className="text-sm font-bold text-stone-700">
          Channel
          <select className={fieldClass} name="channel" defaultValue="Offline" required>
            <option>Offline</option><option>Marketplace</option><option>Instagram</option><option>TikTok</option><option>WA</option>
          </select>
        </label>
        <label className="text-sm font-bold text-stone-700">
          Metode bayar <span className="text-red-600">*</span>
          <select className={fieldClass} name="paymentMethod" defaultValue="Tunai" required>
            <option>Tunai</option><option>Transfer</option>
          </select>
        </label>
        <label className="text-sm font-bold text-stone-700">
          Durasi garansi (hari) <span className="text-red-600">*</span>
          <input className={fieldClass} name="warrantyDays" type="number" min="1" step="1" defaultValue={defaultWarrantyDays} required />
        </label>
      </section>

      <SaleTestSection onBlockedChange={setBlocked} />
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      <p className="text-center text-sm font-medium text-stone-600">Pastikan test sudah ditinjau pembeli sebelum pembayaran sisa.</p>
      <button className="w-full rounded-xl bg-amber-700 px-6 py-4 font-black text-white hover:bg-amber-800 disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending || blocked || expired}>
        {pending ? "Memproses..." : blocked ? "Diblokir" : expired ? "Kadaluwarsa" : "Konfirmasi pelunasan"}
      </button>
    </form>
  );
}
