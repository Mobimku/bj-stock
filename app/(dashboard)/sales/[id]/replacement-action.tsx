"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FinanceAccount, ReplacementCandidate, ReplacementClaim } from "./sale-detail-data";

const responseSchema = z.union([
  z.object({ replacement: z.object({ id_replacement: z.string().uuid() }) }),
  z.object({ error: z.string() }),
]);
const fieldClass = "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20";

type Props = {
  readonly idInvoice: string;
  readonly currentUnitId: string;
  readonly currentValue: number;
  readonly currentWarrantyStart: string;
  readonly currentWarrantyEnd: string;
  readonly defaultDate: string;
  readonly claims: readonly ReplacementClaim[];
  readonly candidates: readonly ReplacementCandidate[];
  readonly accounts: readonly FinanceAccount[];
};

export function ReplacementAction(props: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [replacementValue, setReplacementValue] = useState(String(props.currentValue));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const parsedValue = replacementValue === "" ? null : Number(replacementValue);
  const previewDifference = parsedValue !== null && Number.isFinite(parsedValue)
    ? parsedValue - props.currentValue
    : 0;
  const unavailableReason = props.claims.length === 0
    ? "Buat klaim garansi aktif untuk unit ini terlebih dahulu."
    : props.candidates.length === 0
      ? "Belum ada unit Ready atau Listed yang dapat dijadikan pengganti."
      : null;

  function closeDialog() {
    if (pending) return;
    setError("");
    dialogRef.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/sales/${props.idInvoice}/replacement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          claimId: values.get("claimId"),
          replacementUnitId: values.get("replacementUnitId"),
          replacementValue: values.get("replacementValue"),
          replacementDate: values.get("replacementDate"),
          reason: values.get("reason"),
          accountId: previewDifference === 0 ? null : values.get("accountId"),
        }),
      });
      const result = responseSchema.safeParse(await response.json());
      if (!result.success) {
        setError("Respons server tidak valid. Coba kirim ulang tanpa mengubah data.");
        return;
      }
      if (!response.ok || "error" in result.data) {
        setError("error" in result.data ? result.data.error : "Penggantian unit gagal diproses.");
        return;
      }

      idempotencyKeyRef.current = null;
      form.reset();
      setReplacementValue(String(props.currentValue));
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Coba kirim ulang tanpa mengubah data.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="w-full rounded-xl bg-[var(--brand-primary)] px-5 py-3 font-black text-white hover:brightness-90 sm:w-auto"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Tukar unit
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-0 text-[var(--text-primary)] shadow-2xl backdrop:bg-black/60"
        onClick={(event) => { if (event.target === dialogRef.current) closeDialog(); }}
        onCancel={(event) => { if (pending) event.preventDefault(); }}
        onClose={() => {
          idempotencyKeyRef.current = null;
          setError("");
        }}
      >
        <form className="p-5 sm:p-7" onChange={() => { idempotencyKeyRef.current = null; }} onSubmit={submit}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-secondary)]">Owner · F-WRT-04</p>
              <h2 className="mt-2 text-2xl font-black">Ganti unit dalam garansi</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Ini bukan retur atau penjualan kedua. Invoice asli tetap utuh.</p>
            </div>
            <button className="rounded-lg px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--background)]" type="button" onClick={closeDialog}>Tutup</button>
          </div>

          <div className="mt-5 rounded-xl bg-[var(--background)] p-4 text-sm text-[var(--text-secondary)]">
            <p><strong className="text-[var(--text-primary)]">{props.currentUnitId}</strong> akan berpindah dari Terjual ke QC.</p>
            <p className="mt-1">Unit pengganti menjadi Terjual. Garansi baru memakai akhir terlama antara garansi saat ini dan masa grace server.</p>
          </div>

          {unavailableReason && (
            <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900" role="status">
              <p>{unavailableReason}</p>
              {props.claims.length === 0 && <Link className="mt-3 inline-block rounded-lg bg-amber-800 px-4 py-2 text-white" href={`/warranty?unit=${props.currentUnitId}`}>Buat klaim garansi</Link>}
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-[var(--text-secondary)] sm:col-span-2">
              Klaim garansi
              <select className={fieldClass} name="claimId" required disabled={props.claims.length === 0}>
                {props.claims.length === 0
                  ? <option value="">Belum ada klaim garansi</option>
                  : props.claims.map((claim) => <option value={claim.id_klaim} key={claim.id_klaim}>{formatDate(claim.tanggal)} · {claim.keluhan}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-[var(--text-secondary)] sm:col-span-2">
              Unit pengganti
              <select className={fieldClass} name="replacementUnitId" required>
                {props.candidates.map((candidate) => (
                  <option value={candidate.id_unit} key={candidate.id_unit}>
                    {candidate.id_unit} · {candidate.brand} {candidate.model ?? ""} · {candidate.status}{candidate.harga_listing !== null ? ` · ${formatCurrency(candidate.harga_listing)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-[var(--text-secondary)]">
              Nilai unit pengganti yang disepakati
              <input className={fieldClass} name="replacementValue" inputMode="numeric" min="1" step="1" type="number" value={replacementValue} onChange={(event) => setReplacementValue(event.target.value)} required />
            </label>
            <label className="text-sm font-bold text-[var(--text-secondary)]">
              Tanggal penggantian
              <input className={fieldClass} name="replacementDate" type="date" defaultValue={props.defaultDate} min={props.currentWarrantyStart} max={props.currentWarrantyEnd} required />
            </label>
          </div>

          <div className={`mt-4 rounded-xl p-4 ${previewDifference === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            <p className="text-xs font-bold uppercase">Preview selisih</p>
            <p className="mt-1 text-xl font-black">{previewDifference > 0 ? "+" : previewDifference < 0 ? "−" : ""}{formatCurrency(Math.abs(previewDifference))}</p>
            <p className="mt-1 text-xs">Preview ini hanya panduan. Nilai Finance dan garansi dihitung ulang secara otoritatif oleh server.</p>
          </div>

          {previewDifference !== 0 && (
            <label className="mt-4 block text-sm font-bold text-[var(--text-secondary)]">
              Akun Finance untuk {previewDifference > 0 ? "top-up masuk" : "refund keluar"}
              <select className={fieldClass} name="accountId" defaultValue="" required>
                <option value="" disabled>Pilih akun aktif</option>
                {props.accounts.map((account) => <option value={account.id_account} key={account.id_account}>{account.nama}</option>)}
              </select>
            </label>
          )}

          <label className="mt-4 block text-sm font-bold text-[var(--text-secondary)]">
            Alasan penggantian
            <textarea className={fieldClass} name="reason" rows={3} maxLength={2000} required />
          </label>
          {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button className="rounded-xl border border-[var(--border)] px-4 py-3 font-bold text-[var(--text-secondary)] hover:bg-[var(--background)]" type="button" onClick={closeDialog} disabled={pending}>Batal</button>
            <button className="rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-black text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={pending || unavailableReason !== null}>{pending ? "Memproses..." : "Konfirmasi"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
