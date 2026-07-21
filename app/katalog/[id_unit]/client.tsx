"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";

export function KatalogDetailClient({
  photos,
  children,
}: {
  photos: string[];
  children: ReactNode;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightboxOpen && !dialog.open) dialog.showModal();
    else if (!lightboxOpen && dialog.open) dialog.close();
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowRight") setActiveIdx((i) => (i + 1) % photos.length);
      if (e.key === "ArrowLeft") setActiveIdx((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, photos.length]);

  return (
    <>
      <div className="mx-auto md:grid md:max-w-5xl md:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] md:items-start md:gap-6 md:px-6 md:py-6">
        {/* Gallery */}
        {photos.length > 0 && (
          <div className="overflow-hidden md:rounded-2xl md:border md:border-[#dde5de] md:bg-white md:shadow-sm">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="relative aspect-[4/3] w-full bg-[#eaf0ec]"
            >
              <Image
                src={photos[activeIdx]}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 767px) 100vw, 524px"
              />
            </button>
            {photos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto bg-white px-5 py-2">
                {photos.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`h-13 w-13 shrink-0 overflow-hidden rounded-md border-2 ${
                      i === activeIdx ? "border-[#198929]" : "border-transparent"
                    }`}
                  >
                    <Image
                      src={url}
                      alt=""
                      width={52}
                      height={52}
                      className="h-full w-full object-cover"
                      sizes="52px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="min-w-0 md:overflow-hidden md:rounded-2xl md:border md:border-[#dde5de] md:bg-white md:shadow-sm">
          {children}
        </div>
      </div>

      {/* Lightbox */}
      <dialog
        ref={dialogRef}
        onClose={() => setLightboxOpen(false)}
        onClick={(e) => { if (e.target === dialogRef.current) setLightboxOpen(false); }}
        className="fixed inset-0 z-50 m-0 flex h-full w-full max-h-full max-w-full items-center justify-center bg-black/90 p-4 backdrop:bg-black/50 [&:not([open])]:hidden"
      >
        <div className="relative flex max-h-full max-w-full flex-col items-center">
          <Image
            className="max-h-[86vh] max-w-[92vw] rounded-lg object-contain"
            src={photos[activeIdx]}
            alt=""
            width={1600}
            height={1200}
            sizes="92vw"
            quality={90}
          />
          <div className="mt-3 flex items-center gap-2 text-white">
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => setActiveIdx((i) => (i - 1 + photos.length) % photos.length)} className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Sebelumnya">←</button>
                <span className="text-sm tabular-nums">{activeIdx + 1} / {photos.length}</span>
                <button type="button" onClick={() => setActiveIdx((i) => (i + 1) % photos.length)} className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Berikutnya">→</button>
              </>
            )}
            <button type="button" onClick={() => setLightboxOpen(false)} className="ml-2 flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Tutup">✕</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
