"use client";

import Link from "next/link";

const prices = [
  { label: "Semua harga", value: "" },
  { label: "< Rp2jt", value: "under_2" },
  { label: "Rp2–5jt", value: "2_to_5" },
  { label: "> Rp5jt", value: "over_5" },
];

export function CatalogFilterBar({ activePrice, activeSort }: { activePrice: string; activeSort: string }) {
  return (
    <div className="space-y-2 px-5 pt-4 md:flex md:items-center md:justify-between md:space-y-0 md:px-6 md:pt-5">
      <div className="flex flex-wrap gap-1.5">
        {prices.map((price) => {
          const params = new URLSearchParams();
          if (price.value) params.set("price", price.value);
          if (activeSort !== "newest") params.set("sort", activeSort);
          const query = params.toString();
          return (
          <Link
            key={price.value}
            href={`/katalog${query ? `?${query}` : ""}`}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
              activePrice === price.value
                ? "border-[#198929] bg-[#198929] text-white"
                : "border-[#dde5de] bg-white text-[#5e6b61]"
            }`}
          >
            {price.label}
          </Link>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-[#dde5de] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#172019]"
          onClick={() => (document.getElementById("sortSheet") as HTMLDialogElement)?.showModal()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Urutkan
        </button>
      </div>
    </div>
  );
}
