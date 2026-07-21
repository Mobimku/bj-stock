"use client";

import { useState } from "react";
import { EditUnitForm } from "./edit-form";

type SpecData = {
  id_unit: string;
  brand: string;
  model: string | null;
  spek_saat_ini: string | null;
  kondisi_fisik: string | null;
  kondisi_fungsi: string | null;
};

export function EditSpecButton({ unit }: { unit: SpecData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-amber-600 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50"
      >
        Edit unit
      </button>
      <EditUnitForm unit={unit} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
