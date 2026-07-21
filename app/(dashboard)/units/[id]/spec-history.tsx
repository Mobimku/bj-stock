import { formatDateTime } from "@/lib/format";
import { z } from "zod";
import { specHistorySchema } from "@/lib/validation/unit";

type History = z.infer<typeof specHistorySchema>[number];

export function SpecHistory({ history }: { history: History[] }) {
  if (history.length <= 1) {
    return (
      <p className="mt-3 text-sm text-stone-500">
        Belum ada riwayat perubahan spesifikasi.
      </p>
    );
  }

  return (
    <ol className="mt-4 space-y-4 border-l-2 border-stone-200 pl-4">
      {history.map((entry, i) => (
        <li key={entry.id_history} className="relative">
          <span
            className={[
              "absolute -left-[1.4rem] top-1 size-3 rounded-full ring-4 ring-white",
              i === 0 ? "bg-amber-500" : "bg-stone-300",
            ].join(" ")}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {formatDateTime(entry.changed_at)}
            </p>
            {i === 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                Terbaru
              </span>
            )}
            {entry.catatan === "Spek awal saat unit dibuat" && (
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                Spek awal
              </span>
            )}
          </div>
          <div className="mt-2 grid gap-1 text-sm">
            <div className="flex gap-2">
              <span className="font-bold text-stone-500">Spek:</span>
              <span className="whitespace-pre-wrap text-stone-800">{entry.spek_saat_ini ?? "-"}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-stone-500">Fisik:</span>
              <span className="text-stone-800">{entry.kondisi_fisik ? `Grade ${entry.kondisi_fisik}` : "-"}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-stone-500">Fungsi:</span>
              <span className="text-stone-800">{entry.kondisi_fungsi ?? "-"}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
