"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DowngradePartButton({ unitId, logId, partId }: { unitId: string; logId: string; partId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function downgrade() {
    if (!window.confirm(`Lepas ${partId} dari unit dan kembalikan ke Bank Stock?`)) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/units/${unitId}/upgrade`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Part gagal dilepas.");
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      <button className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60" type="button" onClick={downgrade} disabled={pending}>
        {pending ? "Melepas..." : "Lepas part"}
      </button>
      {error && <p className="mt-2 max-w-56 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}
