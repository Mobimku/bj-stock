"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatCurrency } from "@/lib/format";
import { saleUnitTestSchema } from "@/lib/validation/sales";
import { normalizeWhatsapp } from "@/lib/validation/whatsapp";
import { SaleTestSection } from "./sale-test-section";
import { buildSaleTestPayload } from "./sale-test-payload";

type Customer = { id: string; name: string; wa: string | null };
const saleResponseSchema = z.object({ idInvoice: z.string().optional(), error: z.string().optional() });

export function SaleForm({
  unit,
  customers,
  defaultDate,
  defaultWarrantyDays,
}: {
  unit: { id: string; label: string; totalCapital: number | string; listingPrice: number | string | null };
  customers: Customer[];
  defaultDate: string;
  defaultWarrantyDays: number;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const stepOneRef = useRef<HTMLDivElement>(null);
  const fieldClass =
    "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

  function goToTest() {
    const firstInvalid = Array.from(
      stepOneRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[required], select[required]") ?? [],
    ).find((field) => !field.checkValidity());
    if (firstInvalid) {
      firstInvalid.reportValidity();
      return;
    }
    setError("");
    setStep(2);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError("");
    if (blocked) {
      setError("Penjualan diblokir karena masih ada temuan pada pemeriksaan blocker.");
      return;
    }
    const unitTest = saleUnitTestSchema.safeParse(buildSaleTestPayload(values));
    if (!unitTest.success) {
      setError(unitTest.error.issues[0]?.message ?? "Pengujian unit belum lengkap.");
      return;
    }
    setPending(true);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: unit.id,
          customerId,
          customerName: values.get("customerName") ?? "",
          customerWa: values.get("customerWa") ?? "",
          customerSegment: values.get("customerSegment") ?? "",
          customerSource: values.get("customerSource") ?? "",
          salePrice: values.get("salePrice"),
          channel: values.get("channel"),
          paymentMethod: values.get("paymentMethod"),
          transactionDate: values.get("transactionDate"),
          warrantyDays: values.get("warrantyDays"),
          unitTest: unitTest.data,
        }),
      });
      const result = saleResponseSchema.safeParse(await response.json());

      if (!response.ok || !result.success || !result.data.idInvoice) {
        setError(result.success ? result.data.error ?? "Transaksi gagal disimpan." : "Respons server tidak valid.");
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
      <ol className="grid grid-cols-2 gap-2" aria-label="Tahapan transaksi">
        <li className={`rounded-xl px-4 py-3 text-center text-sm font-black ${step === 1 ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-500"}`}>1. Detail transaksi</li>
        <li className={`rounded-xl px-4 py-3 text-center text-sm font-black ${step === 2 ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-500"}`}>2. Pengujian unit</li>
      </ol>

      <div className={step === 1 ? "grid gap-6" : "hidden"} ref={stepOneRef}>
      <section className="rounded-2xl bg-stone-950 p-6 text-white">
        <p className="font-mono text-sm font-bold text-amber-400">{unit.id}</p>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Model unit</p>
        <h2 className="mt-2 text-2xl font-black">{unit.label}</h2>
        <div className="mt-5 border-t border-stone-800 pt-4">
          <p className="text-xs font-bold uppercase text-stone-500">Total modal terkunci</p>
          <p className="mt-1 text-xl font-black">{formatCurrency(unit.totalCapital)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-black">Customer</h2>
        <label className="mt-5 block text-sm font-bold text-stone-700">
          Pilih customer tersimpan
          <select className={fieldClass} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Customer baru</option>
            {customers.map((customer) => (
              <option value={customer.id} key={customer.id}>
                {customer.name}{customer.wa ? ` · ${customer.wa}` : ""}
              </option>
            ))}
          </select>
        </label>

        {!customerId && (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-bold text-stone-700">
              Nama <span className="text-red-600">*</span>
              <input className={fieldClass} name="customerName" maxLength={100} required />
            </label>
            <label className="text-sm font-bold text-stone-700">
              Nomor WA
              <input
                className={fieldClass}
                name="customerWa"
                inputMode="tel"
                maxLength={40}
                placeholder="628123456789"
                onBlur={(event) => {
                  const next = normalizeWhatsapp(event.currentTarget.value);
                  if (next) event.currentTarget.value = next;
                }}
              />
            </label>
            <label className="text-sm font-bold text-stone-700">
              Segmen
              <select className={fieldClass} name="customerSegment" defaultValue="">
                <option value="">Belum ditentukan</option>
                <option>Pelajar</option>
                <option>Orang Tua</option>
                <option>Remote Worker</option>
                <option>Lainnya</option>
              </select>
            </label>
            <label className="text-sm font-bold text-stone-700">
              Sumber lead
              <select className={fieldClass} name="customerSource" defaultValue="">
                <option value="">Belum ditentukan</option>
                <option>TikTok</option>
                <option>Reels</option>
                <option>Instagram</option>
                <option>Facebook Marketplace</option>
                <option>WA</option>
                <option>Referral</option>
                <option>Lainnya</option>
              </select>
            </label>
          </div>
        )}
      </section>

      <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 sm:grid-cols-2">
        <h2 className="text-xl font-black sm:col-span-2">Transaksi</h2>
        <label className="text-sm font-bold text-stone-700">
          Harga jual <span className="text-red-600">*</span>
          <input className={fieldClass} name="salePrice" type="number" min="1" step="1" defaultValue={unit.listingPrice ?? ""} required />
        </label>
        <label className="text-sm font-bold text-stone-700">
          Tanggal transaksi <span className="text-red-600">*</span>
          <input className={fieldClass} name="transactionDate" type="date" defaultValue={defaultDate} required />
        </label>
        <label className="text-sm font-bold text-stone-700">
          Durasi garansi (hari) <span className="text-red-600">*</span>
          <input className={fieldClass} name="warrantyDays" type="number" min="1" step="1" defaultValue={defaultWarrantyDays} required />
        </label>
        <label className="text-sm font-bold text-stone-700">
          Channel
          <select className={fieldClass} name="channel" defaultValue="Offline" required>
            <option>Offline</option>
            <option>Marketplace</option>
            <option>Instagram</option>
            <option>TikTok</option>
            <option>WA</option>
          </select>
        </label>
        <label className="text-sm font-bold text-stone-700">
          Metode bayar
          <select className={fieldClass} name="paymentMethod" defaultValue="Tunai" required>
            <option>Tunai</option>
            <option>Transfer</option>
            <option>Cicilan</option>
          </select>
        </label>
      </section>

        <button className="rounded-xl bg-amber-700 px-6 py-4 font-black text-white hover:bg-amber-800" type="button" onClick={goToTest}>
          Selanjutnya: pengujian unit
        </button>
      </div>

      <div className={step === 2 ? "grid gap-6" : "hidden"}>
        <section className="rounded-2xl bg-stone-950 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Unit yang diuji</p>
          <p className="mt-2 text-xl font-black">{unit.label}</p>
          <p className="mt-1 font-mono text-sm text-amber-400">{unit.id}</p>
        </section>
        <SaleTestSection onBlockedChange={setBlocked} />

        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
        <p className="text-center text-sm font-medium text-stone-600">Pastikan test sudah ditinjau pembeli sebelum pembayaran. Konfirmasi menyimpan test dan penjualan sekaligus.</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="rounded-xl border border-stone-300 px-4 py-4 font-bold text-stone-700 hover:bg-stone-100" type="button" onClick={() => setStep(1)} disabled={pending}>Kembali</button>
          <button
            className="rounded-xl bg-amber-700 px-4 py-4 font-black text-white hover:bg-amber-800 disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={pending || blocked}
          >
            {pending ? "Memproses..." : blocked ? "Diblokir" : "Konfirmasi penjualan"}
          </button>
        </div>
      </div>
    </form>
  );
}
