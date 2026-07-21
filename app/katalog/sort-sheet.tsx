"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const sorts = [
  { label: "Termurah", value: "price_asc" },
  { label: "Termahal", value: "price_desc" },
  { label: "Terbaru", value: "newest" },
  { label: "Terlama", value: "oldest" },
];

export function CatalogSortSheet({
  activeSort,
  price,
}: {
  activeSort: string;
  price: string;
}) {
  const router = useRouter();
  const [selSort, setSelSort] = useState(activeSort);

  function apply() {
    const p = new URLSearchParams();
    if (price) p.set("price", price);
    if (selSort !== "newest") p.set("sort", selSort);
    const qs = p.toString();
    router.push(`/katalog${qs ? "?" + qs : ""}`);
    (document.getElementById("sortSheet") as HTMLDialogElement)?.close();
  }

  return (
    <dialog id="sortSheet" className="mx-auto mt-auto w-full max-w-[480px] rounded-t-2xl border-none p-0 backdrop:bg-[#172019]/40">
      <div className="px-5 py-2">
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[#dde5de]" />
        <h3 className="text-base font-bold">Urutkan katalog</h3>

        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5e6b61]">Urutkan</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sorts.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSelSort(s.value)}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
                  selSort === s.value
                    ? "border-[#198929] bg-[#198929] text-white"
                    : "border-[#dde5de] bg-white text-[#5e6b61]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={apply}
          className="mt-5 w-full rounded-xl bg-[#198929] py-3 text-sm font-bold text-white"
        >
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => (document.getElementById("sortSheet") as HTMLDialogElement)?.close()}
          className="mt-1 w-full py-2 text-xs font-medium text-[#5e6b61]"
        >
          Batal
        </button>
      </div>
    </dialog>
  );
}
