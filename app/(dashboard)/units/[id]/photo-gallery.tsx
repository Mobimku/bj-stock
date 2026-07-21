"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  fotoUrl: string[];
  canDelete?: boolean;
};

export function PhotoGallery({ id, fotoUrl, canDelete = false }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function bukaLightbox(i: number) {
    setLightboxIndex(i);
  }

  function tutupLightbox() {
    setLightboxIndex(null);
  }

  function nextFoto() {
    setLightboxIndex((cur) => (cur === null ? null : (cur + 1) % fotoUrl.length));
  }

  function prevFoto() {
    setLightboxIndex((cur) => (cur === null ? null : (cur - 1 + fotoUrl.length) % fotoUrl.length));
  }

  async function hapus(url: string) {
    if (!confirm("Hapus foto ini?")) return;
    setPending(url);
    try {
      const res = await fetch(`/api/units/${id}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string };
        alert(error ?? "Gagal menghapus foto.");
        return;
      }
      router.refresh();
    } catch {
      alert("Tidak dapat terhubung ke server.");
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightboxIndex !== null && !dialog.open) {
      dialog.showModal();
    } else if (lightboxIndex === null && dialog.open) {
      dialog.close();
    }
  }, [lightboxIndex, fotoUrl.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutupLightbox();
      if (e.key === "ArrowRight") nextFoto();
      if (e.key === "ArrowLeft") prevFoto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex]);

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fotoUrl.map((url, i) => (
          <div className="group relative" key={url}>
            <button
              type="button"
              onClick={() => bukaLightbox(i)}
              className="block w-full overflow-hidden rounded-xl"
              aria-label={`Lihat foto ${i + 1} lebih besar`}
            >
              <Image
                className="aspect-[4/3] w-full object-cover"
                src={url}
                alt={`Foto unit ${i + 1}`}
                width={400}
                height={300}
                sizes="(max-width: 639px) calc((100vw - 44px) / 2), (max-width: 1023px) calc((100vw - 72px) / 3), (max-width: 1279px) calc((100vw - 416px) / 3), 288px"
              />
            </button>
            {canDelete && (
              <button
                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                onClick={() => hapus(url)}
                disabled={pending === url}
                aria-label={`Hapus foto ${i + 1}`}
              >
                {pending === url ? "..." : "✕"}
              </button>
            )}
          </div>
        ))}
      </section>

      {lightboxIndex !== null && (
        <dialog
          ref={dialogRef}
          onClose={tutupLightbox}
          onClick={(e) => {
            if (e.target === dialogRef.current) tutupLightbox();
          }}
          className="fixed inset-0 z-50 m-0 flex h-full w-full max-h-full max-w-full items-center justify-center bg-black/90 p-4 backdrop:bg-black/50 [&:not([open])]:hidden"
        >
          <div className="relative flex max-h-full max-w-full flex-col items-center">
            <div className="relative w-full">
              <Image
                className="max-h-[86vh] max-w-[92vw] rounded-lg object-contain"
                src={fotoUrl[lightboxIndex]}
                alt={`Foto unit ${lightboxIndex + 1}`}
                width={1600}
                height={1200}
                sizes="92vw"
                quality={90}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-white">
              {fotoUrl.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevFoto}
                    className="size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                    aria-label="Foto sebelumnya"
                  >
                    ←
                  </button>
                  <span className="text-sm tabular-nums">
                    {lightboxIndex + 1} / {fotoUrl.length}
                  </span>
                  <button
                    type="button"
                    onClick={nextFoto}
                    className="size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                    aria-label="Foto berikutnya"
                  >
                    →
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={tutupLightbox}
                className="ml-2 size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
