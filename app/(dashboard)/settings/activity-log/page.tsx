import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActivityLogTable } from "./activity-log-table";

export const dynamic = "force-dynamic";

export type LogEntry = {
  id_log: string;
  user_id: string;
  user_role: string;
  aksi: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export default async function ActivityLogPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.app_metadata.role !== "owner") redirect("/scan");

  const { data, error } = await supabase
    .from("admin_actions_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const logs: LogEntry[] = (data ?? []) as LogEntry[];

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-black text-[#172019]">Log Aktivitas</h1>
        <p className="mt-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">Gagal memuat log: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-black text-[#172019]">Log Aktivitas</h1>
      <p className="mt-1 text-sm text-[#5e6b61]">Audit trail aksi sensitif — read-only, terurut waktu terbaru.</p>
      <ActivityLogTable logs={logs} />
    </main>
  );
}