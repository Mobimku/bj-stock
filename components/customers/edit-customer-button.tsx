"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeWhatsapp } from "@/lib/validation/whatsapp";

export function EditCustomerButton({ customer }: { customer: { id_customer: string; nama: string; kontak_wa: string | null; segmen: string | null; sumber_lead: string | null } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(customer.nama);
  const [kontakWa, setKontakWa] = useState(customer.kontak_wa ?? "");
  const [segmen, setSegmen] = useState(customer.segmen ?? "");
  const [sumberLead, setSumberLead] = useState(customer.sumber_lead ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/customers/${customer.id_customer}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nama: nama.trim(),
        kontak_wa: kontakWa.trim() || null,
        segmen: segmen || null,
        sumber_lead: sumberLead || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Gagal menyimpan." }));
      setError(body.error);
      setLoading(false);
      return;
    }
    router.refresh();
    setOpen(false);
  }

  return (
    <>
      <button className="rounded-xl border-2 border-amber-600 px-4 py-2 text-sm font-bold text-amber-600 hover:bg-amber-50" onClick={() => setOpen(true)} type="button">Edit</button>
      {open && (
        <dialog className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 open:flex" open onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onSubmit={handleSave}>
            <p className="text-lg font-black">Edit customer</p>
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-bold uppercase text-stone-500">Nama<input className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-[#172019]" value={nama} onChange={(e) => setNama(e.target.value)} required maxLength={100} /></label>
              <label className="block text-xs font-bold uppercase text-stone-500">WhatsApp<input className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-[#172019]" value={kontakWa} onChange={(e) => setKontakWa(e.target.value)} onBlur={() => setKontakWa((v) => normalizeWhatsapp(v) || v)} placeholder="62812..." maxLength={40} inputMode="tel" /></label>
              <label className="block text-xs font-bold uppercase text-stone-500">Segmen<select className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-[#172019]" value={segmen} onChange={(e) => setSegmen(e.target.value)}><option value="">-</option><option>Pelajar</option><option>Orang Tua</option><option>Remote Worker</option><option>Lainnya</option></select></label>
              <label className="block text-xs font-bold uppercase text-stone-500">Sumber lead<select className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-[#172019]" value={sumberLead} onChange={(e) => setSumberLead(e.target.value)}><option value="">-</option><option>TikTok</option><option>Reels</option><option>Instagram</option><option>Facebook Marketplace</option><option>WA</option><option>Referral</option><option>Lainnya</option></select></label>
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-xl px-4 py-2 font-bold text-stone-600 hover:bg-stone-100" disabled={loading} onClick={() => setOpen(false)} type="button">Batal</button>
              <button className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:opacity-50" disabled={loading} type="submit">{loading ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
