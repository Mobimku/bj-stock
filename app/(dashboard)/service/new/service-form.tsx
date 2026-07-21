"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { normalizeWhatsapp } from "@/lib/validation/whatsapp";

type Customer = { id: string; name: string; wa: string | null };

export function ServiceForm({
  unit,
  customers,
  defaultCustomerId,
  defaultDate,
  canCreateClaim,
  defaultClaim,
}: {
  unit: { id: string; label: string } | null;
  customers: Customer[];
  defaultCustomerId: string;
  defaultDate: string;
  canCreateClaim: boolean;
  defaultClaim: boolean;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const fieldClass =
    "mt-2 w-full rounded-xl border border-[#dde5de] bg-white px-4 py-3 text-base outline-none focus:border-[#198929] focus:ring-2 focus:ring-[#198929]/20";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: unit?.id ?? "",
          customerId,
          customerName: values.get("customerName") ?? "",
          customerWa: values.get("customerWa") ?? "",
          customerSegment: values.get("customerSegment") ?? "",
          customerSource: values.get("customerSource") ?? "",
          serviceType: values.get("serviceType"),
          brandModel: values.get("brandModel") ?? "",
          complaint: values.get("complaint"),
          entryDate: values.get("entryDate"),
          estimatedCompletion: values.get("estimatedCompletion") ?? "",
          serviceWarrantyDays: values.get("serviceWarrantyDays"),
          createWarrantyClaim: values.get("createWarrantyClaim") === "on",
        }),
      });
      const result = (await response.json()) as { idService?: string; error?: string };

      if (!response.ok || !result.idService) {
        setError(result.error ?? "Order servis gagal disimpan.");
        return;
      }
      router.push(`/service/${result.idService}`);
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={submit}>
      {unit ? (
        <section className="rounded-2xl bg-[#198929] p-6 text-white">
          <p className="font-mono text-sm font-bold text-[#ffdc50]">{unit.id}</p>
          <h2 className="mt-2 text-2xl font-black">{unit.label}</h2>
          <p className="mt-2 text-sm text-white/75">Data perangkat berasal dari QR unit BJ Laptop.</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-[#dde5de] bg-white p-6">
          <h2 className="text-xl font-black">Perangkat customer luar</h2>
          <label className="mt-5 block text-sm font-bold text-[#172019]">
            Brand dan model <span className="text-[#c62828]">*</span>
            <input className={fieldClass} name="brandModel" maxLength={200} placeholder="Asus VivoBook A412" required />
          </label>
        </section>
      )}

      <section className="rounded-2xl border border-[#dde5de] bg-white p-6">
        <h2 className="text-xl font-black">Customer</h2>
        <label className="mt-5 block text-sm font-bold text-[#172019]">
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
            <label className="text-sm font-bold text-[#172019]">
              Nama <span className="text-[#c62828]">*</span>
              <input className={fieldClass} name="customerName" maxLength={100} required />
            </label>
            <label className="text-sm font-bold text-[#172019]">
              Nomor WhatsApp
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
            <label className="text-sm font-bold text-[#172019]">
              Segmen
              <select className={fieldClass} name="customerSegment" defaultValue="">
                <option value="">Belum ditentukan</option>
                <option>Pelajar</option>
                <option>Orang Tua</option>
                <option>Remote Worker</option>
                <option>Lainnya</option>
              </select>
            </label>
            <label className="text-sm font-bold text-[#172019]">
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

      <section className="grid gap-5 rounded-2xl border border-[#dde5de] bg-white p-6 sm:grid-cols-2">
        <h2 className="text-xl font-black sm:col-span-2">Penerimaan servis</h2>
        <label className="text-sm font-bold text-[#172019]">
          Jenis servis
          <select className={fieldClass} name="serviceType" defaultValue="Repair" required>
            <option>Repair</option>
            <option>Install</option>
            <option>Cleaning</option>
          </select>
        </label>
        <label className="text-sm font-bold text-[#172019]">
          Tanggal masuk
          <input className={fieldClass} name="entryDate" type="date" defaultValue={defaultDate} required />
        </label>
        <label className="text-sm font-bold text-[#172019]">
          Estimasi selesai
          <input className={fieldClass} name="estimatedCompletion" type="date" min={defaultDate} />
        </label>
        <label className="text-sm font-bold text-[#172019]">
          Garansi servis (hari)
          <input className={fieldClass} name="serviceWarrantyDays" type="number" min="1" max="365" step="1" defaultValue="7" required />
        </label>
        <label className="text-sm font-bold text-[#172019] sm:col-span-2">
          Keluhan awal <span className="text-[#c62828]">*</span>
          <textarea className={fieldClass} name="complaint" rows={4} maxLength={2000} required />
        </label>
        {canCreateClaim && (
          <label className="flex items-start gap-3 rounded-xl bg-[#ffdc50]/35 p-4 text-sm font-bold text-[#172019] sm:col-span-2">
            <input className="mt-1 size-4 accent-[#198929]" name="createWarrantyClaim" type="checkbox" defaultChecked={defaultClaim} />
            <span>Buat dan tautkan klaim garansi unit untuk order servis ini.</span>
          </label>
        )}
      </section>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-[#c62828]" role="alert">{error}</p>}
      <button className="rounded-xl bg-[#198929] px-6 py-4 font-black text-white hover:bg-[#147522] disabled:cursor-wait disabled:bg-stone-400" type="submit" disabled={pending}>
        {pending ? "Menyimpan..." : "Terima order servis"}
      </button>
    </form>
  );
}
