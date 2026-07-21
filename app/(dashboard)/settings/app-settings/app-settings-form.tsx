"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AppSetting } from "./page";
import { settingLabels, numericKeys } from "@/lib/app-settings";
import { normalizeWhatsapp } from "@/lib/validation/whatsapp";

const fieldClass = "w-full rounded-xl border border-[#dde5de] bg-white px-4 py-3 text-base text-[#172019] outline-none focus:border-[#198929] focus:ring-2 focus:ring-[#198929]/20";
const readOnlyClass = "w-full rounded-xl border border-[#dde5de] bg-[#f7faf7] px-4 py-3 text-sm text-[#5e6b61]";

export function AppSettingsForm({ settings, isOwner }: { settings: AppSetting[]; isOwner: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload: Record<string, string> = {};
    new FormData(form).forEach((v, k) => {
      if (typeof v === "string") payload[k] = v;
    });

    setPending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/settings/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error ?? "Gagal menyimpan."); return; }
      setMessage("Pengaturan berhasil disimpan.");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {message && <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700" role="status">{message}</p>}

      <section className="mt-6 rounded-3xl bg-[#172019] p-4 text-white sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffdc50]">
          {isOwner ? "Edit Pengaturan" : "Lihat Pengaturan"}
        </p>
        <h2 className="mt-2 text-xl font-black">Nilai Default</h2>
        <form className="mt-4 space-y-3" onSubmit={save}>
          {settings.map((s) => (
            <label key={s.key} className="block text-sm font-bold text-white/80">
              {settingLabels[s.key] ?? s.key}
              {isOwner ? (
                numericKeys.includes(s.key) ? (
                  <input className={fieldClass} name={s.key} type="number" min={1} defaultValue={s.value} required />
                ) : s.key === "store_google_maps_url" ? (
                  <input className={fieldClass} name={s.key} type="url" defaultValue={s.value} placeholder="https://maps.app.goo.gl/..." />
                ) : (
                  <input
                    className={fieldClass}
                    name={s.key}
                    type="tel"
                    defaultValue={s.value}
                    placeholder="62812xxxxxxx"
                    maxLength={40}
                    inputMode="tel"
                    onBlur={(event) => {
                      if (s.key === "store_whatsapp_number") {
                        const next = normalizeWhatsapp(event.currentTarget.value);
                        if (next) event.currentTarget.value = next;
                      }
                    }}
                  />
                )
              ) : (
                <div className={readOnlyClass}>{s.value || "—"}{numericKeys.includes(s.key) && " hari"}</div>
              )}
            </label>
          ))}
          {isOwner && (
            <button
              className="w-full rounded-xl bg-[#198929] px-5 py-3 font-black text-white hover:bg-[#147522] disabled:cursor-wait disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          )}
        </form>
        {!isOwner && (
          <p className="mt-3 text-xs text-white/50">Hanya Owner yang dapat mengubah nilai pengaturan ini.</p>
        )}
      </section>
    </>
  );
}
