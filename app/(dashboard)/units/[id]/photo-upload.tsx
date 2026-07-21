"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

export function PhotoUploadForm({ id, currentCount }: { id: string; currentCount: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading" | "committing">("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const remaining = 4 - currentCount;

  if (remaining <= 0) return null;

  async function submit() {
    const input = fileRef.current;
    if (!input?.files?.length) return;

    const files = Array.from(input.files);
    setError("");
    setMessage("");

    // Validate client-side
    const invalid = files.find((f) => !ACCEPTED_TYPES.includes(f.type) || f.size > MAX_SIZE);
    if (invalid) {
      setError("Setiap foto harus JPG, PNG, atau WebP dan maksimal 5 MB.");
      return;
    }
    if (files.length > remaining) {
      setError(`Hanya bisa upload ${remaining} foto lagi.`);
      return;
    }

    try {
      // Phase 1: Get signed upload URLs from server
      setPhase("preparing");
      const ext = files[0].type === "image/webp" ? "webp" : files[0].type === "image/png" ? "png" : "jpg";
      const prepareRes = await fetch(`/api/units/${id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: files.length, fileExt: ext }),
      });
      if (!prepareRes.ok) {
        const { error: err } = (await prepareRes.json()) as { error?: string };
        setError(err ?? "Gagal menyiapkan upload.");
        setPhase("idle");
        return;
      }
      const { uploads } = (await prepareRes.json()) as { uploads: { signedUrl: string; path: string }[] };

      // Phase 2: Upload each file directly to Supabase Storage via signed URL
      setPhase("uploading");
      setProgress({ current: 0, total: files.length });

      for (let i = 0; i < files.length; i++) {
        const uploadRes = await fetch(uploads[i].signedUrl, {
          method: "PUT",
          headers: { "Content-Type": files[i].type },
          body: files[i],
        });
        if (!uploadRes.ok) {
          setError(`Upload foto ${i + 1} gagal.`);
          setPhase("idle");
          return;
        }
        setProgress({ current: i + 1, total: files.length });
      }

      // Phase 3: Commit paths to server
      setPhase("committing");
      const commitRes = await fetch(`/api/units/${id}/photos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: uploads.map((u) => u.path) }),
      });
      if (!commitRes.ok) {
        const { error: err } = (await commitRes.json()) as { error?: string };
        setError(err ?? "Gagal menyimpan referensi foto.");
        setPhase("idle");
        return;
      }

      setMessage("Foto berhasil ditambahkan.");
      input.value = "";
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPhase("idle");
    }
  }

  const isBusy = phase !== "idle";

  return (
    <form
      className="mt-4 rounded-xl bg-stone-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block text-sm font-bold text-stone-700">
        Tambah foto ({remaining} slot tersisa)
        <input
          ref={fileRef}
          className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#198929] file:px-4 file:py-2 file:font-bold file:text-white hover:file:bg-[#147522]"
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          required
        />
        <span className="mt-1 block text-xs font-normal text-stone-500">
          JPG, PNG, atau WebP. Maks 5 MB per foto. Upload langsung ke penyimpanan.
        </span>
      </label>
      <button
        className="mt-3 w-full rounded-xl bg-[#198929] px-4 py-3 font-bold text-white hover:bg-[#147522] disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={isBusy}
      >
        {phase === "preparing"
          ? "Menyiapkan..."
          : phase === "uploading"
            ? `Upload ${progress.current}/${progress.total}...`
            : phase === "committing"
              ? "Menyimpan..."
              : "Upload foto"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      {message && <p className="mt-2 text-sm text-emerald-600" role="status">{message}</p>}
    </form>
  );
}