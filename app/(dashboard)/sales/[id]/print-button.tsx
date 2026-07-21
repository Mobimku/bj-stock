"use client";

export function PrintButton({ label = "Cetak invoice" }: { label?: string }) {
  return (
    <button className="flex-1 whitespace-nowrap rounded-xl bg-stone-950 px-5 py-3 font-bold text-white hover:bg-amber-700 print:hidden sm:flex-none" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
