"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const unitIdPattern = /^BJ-[A-Z0-9]+-\d{4}-\d{3}$/;
const serviceIdPattern = /^(SVC-\d{4}-\d{3})(?:-[0-9A-F-]{36})?$/;
export type ScanPurpose = "unit" | "sale" | "warranty" | "service";

function serviceIdFromValue(rawValue: string) {
  const value = rawValue.trim().toUpperCase();
  const directMatch = value.match(serviceIdPattern);
  if (directMatch) return directMatch[1];
  try {
    const lastSegment = new URL(rawValue, window.location.origin).pathname.split("/").filter(Boolean).at(-1)?.toUpperCase();
    return lastSegment?.match(serviceIdPattern)?.[1] ?? null;
  } catch {
    return null;
  }
}

const supabase = createClient();

async function findTarget(rawValue: string, purpose: ScanPurpose) {
  const unitId = rawValue.trim().toUpperCase();
  if (unitIdPattern.test(unitId)) {
    const { data, error } = await supabase
      .from("units")
      .select("id_unit")
      .eq("id_unit", unitId)
      .maybeSingle();
    if (error || !data) return { error: "Unit tidak ditemukan. Coba cari dengan ID lain." };
    const target = purpose === "sale"
      ? `/sales/new?unit=${encodeURIComponent(unitId)}`
      : purpose === "warranty"
        ? `/warranty?unit=${encodeURIComponent(unitId)}`
        : purpose === "service"
          ? `/service/new?unit=${encodeURIComponent(unitId)}`
          : `/units/${unitId}`;
    return { target };
  }

  if (purpose !== "unit") return { error: "QR atau ID unit tidak valid untuk alur ini." };
  const serviceId = serviceIdFromValue(rawValue);
  if (!serviceId) return { error: "QR atau ID tidak valid." };

  const { data, error } = await supabase
    .from("service_orders")
    .select("id_servis")
    .eq("id_servis", serviceId)
    .maybeSingle();
  if (error || !data) return { error: "Order servis tidak ditemukan." };
  return { target: `/service/${serviceId}` };
}

export function Scanner({ purpose }: { purpose: ScanPurpose }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const checkingRef = useRef(false);
  const [error, setError] = useState("");
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let active = true;

    async function openResult(value: string) {
      if (checkingRef.current) return;
      checkingRef.current = true;
      controlsRef.current?.stop();
      const result = await findTarget(value, purpose);

      if (!active) return;
      if (result.target) router.push(result.target);
      else setError(result.error ?? "QR tidak dapat dibaca.");
      checkingRef.current = false;
    }

    if (videoRef.current) {
      reader
        .decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
            },
            audio: false,
          },
          videoRef.current,
          (result) => {
            if (result) void openResult(result.getText());
          },
        )
        .then((controls) => {
          if (active) controlsRef.current = controls;
          else controls.stop();
        })
        .catch(() => {
          if (active) setError("Kamera tidak dapat dibuka. Izinkan akses kamera atau masukkan ID manual.");
        });
    }

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [purpose, restartKey, router]);

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const result = await findTarget(String(formData.get("unitId") ?? ""), purpose);

    if (result.target) router.push(result.target);
    else setError(result.error ?? "Data tidak ditemukan.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="overflow-hidden rounded-2xl bg-stone-950 p-3">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-black sm:aspect-video">
          <video className="h-full w-full object-cover" ref={videoRef} muted playsInline />
          <div className="pointer-events-none absolute inset-1/2 aspect-square w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-amber-400 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
        </div>
        <p className="px-2 pb-1 pt-4 text-center text-sm font-bold text-white">
          Arahkan kamera ke QR unit atau tanda terima servis
        </p>
      </section>

      <section className="h-fit rounded-2xl border border-stone-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Fallback</p>
        <h2 className="mt-2 text-2xl font-black">Cari ID manual</h2>
        <p className="mt-2 text-sm text-stone-600">Gunakan bila label QR rusak atau kamera tidak tersedia.</p>
        <form className="mt-6" onSubmit={submitManual}>
          <label className="text-sm font-bold text-stone-700">
            {purpose === "unit" ? "ID unit atau servis" : "ID unit"}
            <input
              className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-mono uppercase outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
              name="unitId"
              placeholder={purpose === "unit" ? "BJ-HP-2607-001 / SVC-2607-001" : "BJ-HP-2607-001"}
              autoCapitalize="characters"
              required
            />
          </label>
          <button className="mt-4 w-full rounded-xl bg-stone-950 px-4 py-3 font-bold text-white hover:bg-amber-700" type="submit">
            {purpose === "sale" ? "Buka form penjualan" : purpose === "warranty" ? "Cek garansi" : purpose === "service" ? "Terima servis unit" : "Buka detail"}
          </button>
        </form>
        {error && (
          <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
            <p>{error}</p>
            <button
              className="mt-3 font-bold underline"
              type="button"
              onClick={() => {
                setError("");
                checkingRef.current = false;
                setRestartKey((key) => key + 1);
              }}
            >
              Coba kamera lagi
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
