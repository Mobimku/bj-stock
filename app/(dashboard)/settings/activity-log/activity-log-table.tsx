"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { LogEntry } from "./page";

const aksiLabels: Record<string, string> = {
  create_account: "Buat Akun",
  deactivate_account: "Nonaktifkan Akun",
  reactivate_account: "Aktifkan Akun",
  update_app_setting: "Ubah Pengaturan",
  finance_reversal: "Reversal Finance",
  process_return: "Proses Retur",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ActivityLogTable({ logs }: { logs: LogEntry[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("aksi") ?? "";

  function setFilter(aksi: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (aksi) params.set("aksi", aksi); else params.delete("aksi");
    router.push(`?${params.toString()}`);
  }

  const filteredLogs = currentFilter
    ? logs.filter((l) => l.aksi === currentFilter)
    : logs;

  const aksiTypes = [...new Set(logs.map((l) => l.aksi))];

  return (
    <section className="mt-6">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-full px-3 py-1 text-xs font-bold transition ${!currentFilter ? "bg-[#198929] text-white" : "bg-[#f7faf7] text-[#5e6b61] hover:bg-[#dde5de]"}`}
          onClick={() => setFilter("")}
        >
          Semua
        </button>
        {aksiTypes.map((a) => (
          <button
            key={a}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${currentFilter === a ? "bg-[#198929] text-white" : "bg-[#f7faf7] text-[#5e6b61] hover:bg-[#dde5de]"}`}
            onClick={() => setFilter(a)}
          >
            {aksiLabels[a] ?? a}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[#dde5de] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#dde5de] bg-[#f7faf7] text-xs font-bold uppercase text-[#5e6b61]">
            <tr>
              <th className="px-4 py-3">Waktu</th>
              <th className="px-4 py-3">Aksi</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3 hidden sm:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#dde5de]">
            {filteredLogs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-[#5e6b61]" colSpan={5}>
                  Belum ada log aktivitas.
                </td>
              </tr>
            ) : (
              filteredLogs.map((l) => (
                <tr key={l.id_log} className="hover:bg-[#f7faf7]">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[#5e6b61]">{formatDate(l.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#f7faf7] px-2 py-0.5 text-xs font-bold text-[#172019]">
                      {aksiLabels[l.aksi] ?? l.aksi}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold uppercase text-[#5e6b61]">{l.user_role}</span>
                  </td>
                  <td className="max-w-32 truncate px-4 py-3 text-xs font-mono text-[#5e6b61]">{l.target ?? "-"}</td>
                  <td className="hidden max-w-48 truncate px-4 py-3 text-xs text-[#5e6b61] sm:table-cell">
                    {l.detail ? JSON.stringify(l.detail) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#5e6b61]">Menampilkan {filteredLogs.length} dari {logs.length} entri log.</p>
    </section>
  );
}