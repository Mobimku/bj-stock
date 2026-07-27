"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { saleUnitTestSchema } from "@/lib/validation/sales";
import { SaleTestSection } from "@/app/(dashboard)/sales/new/sale-test-section";
import { buildSaleTestPayload } from "@/app/(dashboard)/sales/new/sale-test-payload";

const fieldClass =
  "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

export function ReservationCompleteForm({
  reservationId,
  defaultWarrantyDays,
  overdue,
}: {
  reservationId: string;
  defaultWarrantyDays: number | null;
  overdue: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError("");
    if (blocked) { setError("Pengujian masih ada temuan blocker."); return; }

    const unitTest = saleUnitTestSchema.safeParse(buildSaleTestPayload(values));
    if (!unitTest.success) { setError(unitTest.error.issues[0]?.message ?? "Pengujian unit belum lengkap."); return; }

    setPending(true);
    try {
      const body = {
        unitTest: unitTest.data,
        paymentMethod: values.get("paymentMethod") ?? "Tunai",
        channel: values.get("channel") ?? "Offline",
        transactionDate: values.get("transactionDate") ?? "",
        warrantyDays: values.get("warrantyDays") ?? "",
      };
      const res = await fetch(`/api/reservations/${reservationId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = z.object({ error: z.string() }).safeParse(json);
        setError(err.success ? err.data.error : "Pelunasan gagal diproses.");
        return;
      }
      const data = z.object({ idInvoice: z.string() }).safeParse(json);
      if (!data.success) { setError("Respons server tidak valid."); return; }
      router.push(`/sales/${data.data.idInvoice}`);
    } catch { setError("Tidak dapat terhubung ke server."); }
    finally { setPending(false); }
  }

  return (
    <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Pelunasan</p>
      <h2 className="mt-2 text-xl font-black">Konfirmasi pelunasan</h2>
      <p className="mt-2 text-sm text-stone-600">Lengkapi pengujian unit dan detail pembayaran untuk menyelesaikan reservasi.</p>

      <form className="mt-5 grid gap-6" onSubmit={submit}>
        <SaleTestSection onBlockedChange={setBlocked} />

        {defaultWarrantyDays === null && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800" role="alert">Durasi garansi tidak tersedia. Hubungi admin untuk mengisi konfigurasi garansi sebelum menyelesaikan reservasi.</p>
        )}

        <div className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
          <h3 className="text-lg font-black sm:col-span-2">Detail pembayaran</h3>
          <label className="text-sm font-bold text-stone-700">
            Metode bayar <span className="text-red-600">*</span>
            <select className={fieldClass} name="paymentMethod" defaultValue="Tunai" required>
              <option>Tunai</option>
              <option>Transfer</option>
            </select>
          </label>
          <label className="text-sm font-bold text-stone-700">
            Channel <span className="text-red-600">*</span>
            <select className={fieldClass} name="channel" defaultValue="Offline" required>
              <option>Offline</option>
              <option>Marketplace</option>
              <option>Instagram</option>
              <option>TikTok</option>
              <option>WA</option>
            </select>
          </label>
          <label className="text-sm font-bold text-stone-700">
            Tanggal transaksi <span className="text-red-600">*</span>
            <input className={fieldClass} name="transactionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </label>
          {defaultWarrantyDays !== null && (
            <label className="text-sm font-bold text-stone-700">
              Durasi garansi (hari) <span className="text-red-600">*</span>
              <input className={fieldClass} name="warrantyDays" type="number" min="1" step="1" defaultValue={defaultWarrantyDays} required />
            </label>
          )}
        </div>

        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}

        <button
          className="w-full rounded-xl bg-[#198929] px-5 py-4 font-bold text-white hover:bg-[#147522] disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={pending || blocked || overdue || defaultWarrantyDays === null}
        >
          {overdue ? "Reservasi terlewat" : defaultWarrantyDays === null ? "Garansi tidak tersedia" : pending ? "Memproses..." : blocked ? "Diblokir" : "Konfirmasi pelunasan"}
        </button>
      </form>
    </section>
  );
}
