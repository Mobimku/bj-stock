import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountManager } from "./account-manager";

export const dynamic = "force-dynamic";

export type UserInfo = {
  id: string;
  email: string;
  role: string;
  nama: string | null;
  created_at: string;
  banned: boolean;
  last_sign_in: string | null;
};

export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.app_metadata.role !== "owner") redirect("/scan");

  const supabaseAdmin = await createAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-black text-[#172019]">Manajemen Akun</h1>
        <p className="mt-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">Gagal memuat data pengguna: {error.message}</p>
      </main>
    );
  }

  const users: UserInfo[] = (data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    role: u.app_metadata?.role ?? "unknown",
    nama: u.user_metadata?.nama ?? null,
    created_at: u.created_at ?? "",
    banned: !!u.banned_until,
    last_sign_in: u.last_sign_in_at ?? null,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-[#5e6b61] hover:text-[#172019] sm:hidden">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Pengaturan
      </Link>
      <h1 className="text-2xl font-black text-[#172019]">Manajemen Akun</h1>
      <p className="mt-1 text-sm text-[#5e6b61]">Buat, nonaktifkan, atau aktifkan kembali akun Admin dan Teknisi.</p>
      <AccountManager users={users} currentUserId={authData.user.id} />
    </main>
  );
}