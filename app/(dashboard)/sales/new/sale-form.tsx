"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { saleUnitTestSchema } from "@/lib/validation/sales";
import { StepOnePrimitive } from "./transaction-type-primitive";
import { CustomerFields } from "./customer-fields";
import { DirectSaleDetails } from "./direct-sale-details";
import { ReservationDetails, serializeWibExpiry } from "./reservation-details";
import { SaleTestSection } from "./sale-test-section";
import { buildSaleTestPayload } from "./sale-test-payload";
import type { UnitOption, Customer } from "./types";

const saleResponseSchema = z.object({ idInvoice: z.string().optional(), error: z.string().optional() });
const reservationResponseSchema = z.object({ idReservation: z.string().optional(), error: z.string().optional() });

export function SaleForm({
  units, preselectedUnitId, customers, defaultDate, defaultWarrantyDays,
}: {
  readonly units: readonly UnitOption[];
  readonly preselectedUnitId: string;
  readonly customers: readonly Customer[];
  readonly defaultDate: string;
  readonly defaultWarrantyDays: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [customerId, setCustomerId] = useState("");
  const [unitId, setUnitId] = useState(preselectedUnitId);
  const [transactionType, setTransactionType] = useState<"sale" | "reservation">("sale");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const stepOneRef = useRef<HTMLDivElement>(null);
  const idempotencyKey = useRef<string>("");
  const selectedUnit = units.find((u) => u.id === unitId) ?? null;

  function ensureKey(): string {
    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    return idempotencyKey.current;
  }

  function goToTest() {
    if (transactionType === "reservation") return;
    const firstInvalid = Array.from(
      stepOneRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[required], select[required]") ?? [],
    ).find((f) => !f.checkValidity());
    if (firstInvalid) { firstInvalid.reportValidity(); return; }
    setError("");
    setStep(2);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError("");

    if (transactionType === "reservation") {
      await submitReservation(values);
      return;
    }

    if (blocked) { setError("Transaksi diblokir karena masih ada temuan pada pemeriksaan blocker."); return; }
    const unitTest = saleUnitTestSchema.safeParse(buildSaleTestPayload(values));
    if (!unitTest.success) { setError(unitTest.error.issues[0]?.message ?? "Pengujian unit belum lengkap."); return; }
    setPending(true);
    try {
      await submitDirectSale(values, unitTest.data);
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  async function submitDirectSale(values: FormData, unitTest: z.infer<typeof saleUnitTestSchema>) {
    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId, customerId,
        customerName: values.get("customerName") ?? "",
        customerWa: values.get("customerWa") ?? "",
        customerSegment: values.get("customerSegment") ?? "",
        customerSource: values.get("customerSource") ?? "",
        salePrice: values.get("salePrice"), channel: values.get("channel"),
        paymentMethod: values.get("paymentMethod"),
        transactionDate: values.get("transactionDate"),
        warrantyDays: values.get("warrantyDays"),
        unitTest,
      }),
    });
    const result = saleResponseSchema.safeParse(await response.json());
    if (!response.ok || !result.success || !result.data.idInvoice) {
      setError(result.success ? result.data.error ?? "Transaksi gagal disimpan." : "Respons server tidak valid.");
      return;
    }
    router.push(`/sales/${result.data.idInvoice}`);
  }

  async function submitReservation(values: FormData) {
    const wibRaw = values.get("wibExpiry");
    const expiry = typeof wibRaw === "string" ? serializeWibExpiry(wibRaw) : null;
    if (!expiry?.ok) { setError(expiry?.error ?? "Batas waktu reservasi tidak valid."); return; }

    setPending(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: ensureKey(), unitId,
          customerId: customerId || "",
          customerName: values.get("customerName") ?? "",
          customerWa: values.get("customerWa") ?? "",
          customerSegment: values.get("customerSegment") ?? "",
          customerSource: values.get("customerSource") ?? "",
          dpAmount: values.get("dpAmount"), agreedPrice: values.get("agreedPrice"),
          isRefundable: values.get("refundable") === "on",
          expiresAt: expiry.value,
        }),
      });
      const result = reservationResponseSchema.safeParse(await response.json());
      if (!response.ok || !result.success || !result.data.idReservation) {
        setError(result.success ? result.data.error ?? "Reservasi gagal disimpan." : "Respons server tidak valid.");
        return;
      }
      router.push("/sales?view=reservations");
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  const showStep2 = transactionType === "sale" && step === 2;

  return (
    <form className="grid gap-6" onSubmit={submit}>
      {transactionType === "sale" && (
        <ol className="grid grid-cols-2 gap-2" aria-label="Tahapan transaksi">
          <li className={`rounded-xl px-4 py-3 text-center text-sm font-black ${step === 1 ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-500"}`}>1. Detail transaksi</li>
          <li className={`rounded-xl px-4 py-3 text-center text-sm font-black ${step === 2 ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-500"}`}>2. Pengujian unit</li>
        </ol>
      )}

      <div className={showStep2 ? "hidden" : "grid gap-6"} ref={stepOneRef}>
        <StepOnePrimitive
          units={units} transactionType={transactionType}
          onTransactionTypeChange={setTransactionType}
          unitId={unitId} onUnitIdChange={setUnitId}
          selectedUnit={selectedUnit}
        />
        <CustomerFields customerId={customerId} onCustomerIdChange={setCustomerId} customers={customers} />
        {transactionType === "sale" ? (
          <DirectSaleDetails key={unitId} listingPrice={selectedUnit?.listingPrice ?? null} defaultDate={defaultDate} defaultWarrantyDays={defaultWarrantyDays} />
        ) : (
          <ReservationDetails key={unitId} selectedUnit={selectedUnit} />
        )}

        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
        {transactionType === "sale" ? (
          <button className="rounded-xl bg-amber-700 px-6 py-4 font-black text-white hover:bg-amber-800" type="button" onClick={goToTest}>
            Selanjutnya: pengujian unit
          </button>
        ) : (
          <button className="rounded-xl bg-amber-700 px-6 py-4 font-black text-white hover:bg-amber-800 disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending}>
            {pending ? "Memproses..." : "Konfirmasi reservasi"}
          </button>
        )}
      </div>

      {showStep2 && (
        <div className="grid gap-6">
          <section className="rounded-2xl bg-stone-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Unit yang diuji</p>
            <p className="mt-2 text-xl font-black">{selectedUnit?.label ?? "—"}</p>
            <p className="mt-1 font-mono text-sm text-amber-400">{selectedUnit?.id ?? ""}</p>
          </section>
          <SaleTestSection onBlockedChange={setBlocked} />
          {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
          <p className="text-center text-sm font-medium text-stone-600">Pastikan test sudah ditinjau pembeli sebelum pembayaran. Konfirmasi menyimpan test dan transaksi sekaligus.</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-xl border border-stone-300 px-4 py-4 font-bold text-stone-700 hover:bg-stone-100" type="button" onClick={() => setStep(1)} disabled={pending}>Kembali</button>
            <button className="rounded-xl bg-amber-700 px-4 py-4 font-black text-white hover:bg-amber-800 disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending || blocked}>
              {pending ? "Memproses..." : blocked ? "Diblokir" : "Konfirmasi penjualan"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
