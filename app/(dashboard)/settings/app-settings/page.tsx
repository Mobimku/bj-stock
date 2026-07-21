import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSettingsForm } from "./app-settings-form";

export const dynamic = "force-dynamic";

export type AppSetting = {
  key: string;
  value: string;
};

export default async function AppSettingsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/scan");
  const role = authData.user.app_metadata.role;
  if (role !== "admin" && role !== "owner") redirect("/scan");

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .order("key");

  const settings: AppSetting[] = data ?? [];
  const isOwner = role === "owner";

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-black text-[#172019]">Pengaturan Aplikasi</h1>
        <p className="mt-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">Gagal memuat pengaturan: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-black text-[#172019]">Pengaturan Aplikasi</h1>
      <p className="mt-1 text-sm text-[#5e6b61]">
        {isOwner ? "Ubah nilai default, kontak, dan lokasi toko untuk katalog." : "Lihat nilai pengaturan (read-only)."}
      </p>
      <AppSettingsForm settings={settings} isOwner={isOwner} />
    </main>
  );
}
