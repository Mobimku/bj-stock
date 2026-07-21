"use client";

import { useState } from "react";
import { recordCatalogEvent } from "../event-tracker";

export function CatalogFloatingActions({
  idUnit,
  mapsUrl,
  shareText,
  shareTitle,
}: {
  readonly idUnit: string;
  readonly mapsUrl: string;
  readonly shareText: string;
  readonly shareTitle: string;
}) {
  const [message, setMessage] = useState("");

  async function share() {
    recordCatalogEvent({ eventType: "share_click", idUnit });
    setMessage("");
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setMessage("Link berhasil disalin.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(window.location.href);
        setMessage("Link berhasil disalin.");
      } catch {
        setMessage("Link tidak dapat dibagikan.");
      }
    }
  }

  const actionClass = "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#198929] xl:min-h-0 xl:w-36";

  return (
    <div className="px-5 pt-4 xl:fixed xl:right-5 xl:top-1/2 xl:z-20 xl:-translate-y-1/2 xl:px-0 xl:pt-0">
      <div className="grid grid-cols-2 gap-2 xl:flex xl:flex-col">
        <button type="button" onClick={share} className={`${actionClass} border-[#198929] bg-white text-[#12621e] hover:bg-[#eaf3de]`} aria-label="Bagikan unit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
          Bagikan
        </button>
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className={`${actionClass} border-[#dde5de] bg-white text-[#172019] hover:border-[#198929]`} aria-label="Buka lokasi toko di Google Maps">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
            Buka lokasi
          </a>
        ) : (
          <button type="button" disabled className={`${actionClass} cursor-not-allowed border-[#dde5de] bg-[#eef2ef] text-[#5e6b61] opacity-70`}>
            Lokasi belum diatur
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs font-medium text-[#12621e] xl:max-w-36" aria-live="polite">{message}</p>
    </div>
  );
}
