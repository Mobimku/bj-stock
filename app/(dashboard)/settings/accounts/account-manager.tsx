"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { UserInfo } from "./page";

const fieldClass = "w-full rounded-xl border border-[#dde5de] bg-white px-4 py-3 text-base text-[#172019] outline-none focus:border-[#198929] focus:ring-2 focus:ring-[#198929]/20";

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function AccountManager({ users, currentUserId }: { users: UserInfo[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function createAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload: Record<string, string> = {};
    new FormData(form).forEach((v, k) => {
      if (typeof v === "string") payload[k] = v;
    });

    setPending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/settings/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error ?? "Gagal membuat akun."); return; }
      setMessage(`Akun ${result.email} berhasil dibuat. Password sementara: ${result.tempPassword ?? "(gagal generate)"}`);
      form.reset();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  async function toggleAccount(id: string, action: "deactivate" | "reactivate") {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/settings/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error ?? "Gagal."); return; }
      setMessage(action === "deactivate" ? "Akun dinonaktifkan." : "Akun diaktifkan kembali.");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      owner: "bg-[#ffdc50] text-[#172019]",
      admin: "bg-[#198929] text-white",
      teknisi: "bg-[#5e6b61] text-white",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${colors[role] ?? "bg-gray-200 text-gray-700"}`}>
        {role}
      </span>
    );
  };

  return (
    <>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {message && <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700" role="status">{message}</p>}

      {/* Create Account Form */}
      <section className="mt-6 rounded-3xl bg-[#172019] px-4 py-5 text-white sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffdc50]">Buat Akun Baru</p>
        <h2 className="mt-1 text-lg font-black sm:text-xl">Tambah Admin / Teknisi</h2>
        <form className="mt-4 space-y-3.5" onSubmit={createAccount}>
          <div>
            <label className="mb-1 block text-xs font-bold text-white/70 sm:text-sm">Email</label>
            <input className={fieldClass} name="email" type="email" placeholder="user@example.com" autoComplete="email" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-white/70 sm:text-sm">Nama</label>
            <input className={fieldClass} name="nama" type="text" placeholder="Nama lengkap" minLength={2} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-white/70 sm:text-sm">Role</label>
            <select className={fieldClass} name="role" defaultValue="admin" required>
              <option value="admin">Admin</option>
              <option value="teknisi">Teknisi</option>
            </select>
          </div>
          <button
            className="w-full rounded-xl bg-[#198929] px-5 py-3.5 text-sm font-black text-white hover:bg-[#147522] disabled:cursor-wait disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Memproses..." : "Buat Akun"}
          </button>
        </form>
        <p className="mt-3 text-xs text-white/40">
          Password sementara dibuat otomatis. Salin password dari notifikasi setelah akun dibuat.
        </p>
      </section>

      {/* User List — Mobile card view */}
      <section className="mt-6">
        <h2 className="text-lg font-black text-[#172019]">Daftar Akun</h2>
        <div className="mt-3 space-y-3 sm:hidden">
          {users.map((u) => (
            <div key={u.id} className="rounded-2xl border border-[#dde5de] bg-white px-4 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#172019]">{u.email}</p>
                  {u.nama && <p className="mt-0.5 text-sm text-[#5e6b61]">{u.nama}</p>}
                </div>
                {roleBadge(u.role)}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${u.banned ? "bg-red-600" : "bg-[#198929]"}`} />
                <span className={`text-xs font-bold ${u.banned ? "text-red-600" : "text-[#198929]"}`}>
                  {u.banned ? "Nonaktif" : "Aktif"}
                </span>
                {(u.id === currentUserId && u.role !== "owner") && <span className="ml-auto text-xs text-[#5e6b61]">Akun Anda</span>}
              </div>
              {u.role !== "owner" && u.id !== currentUserId && (
                <div className="mt-3 border-t border-[#dde5de] pt-3">
                  {u.banned ? (
                    <button className="w-full rounded-xl bg-[#198929] py-3 text-sm font-bold text-white hover:bg-[#147522] disabled:opacity-50" disabled={pending} onClick={() => toggleAccount(u.id, "reactivate")}>Aktifkan Akun</button>
                  ) : (
                    <button className="w-full rounded-xl border-2 border-red-600 bg-white py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={pending} onClick={() => toggleAccount(u.id, "deactivate")}>Nonaktifkan Akun</button>
                  )}
                </div>
              )}
              {u.role === "owner" && <div className="mt-3 border-t border-[#dde5de] pt-3 text-center text-xs text-[#5e6b61]">Akun Owner — tidak bisa dinonaktifkan</div>}
            </div>
          ))}
        </div>
        {/* User List — Desktop table view */}
        <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-[#dde5de] bg-white sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#dde5de] bg-[#f7faf7] text-xs font-bold uppercase text-[#5e6b61]">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dde5de]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#f7faf7]">
                  <td className="max-w-48 truncate px-4 py-3 font-medium text-[#172019]">{u.email}</td>
                  <td className="px-4 py-3 text-[#5e6b61]">{u.nama ?? "-"}</td>
                  <td className="px-4 py-3">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3">
                    {u.banned ? <span className="text-xs font-bold text-red-600">Nonaktif</span> : <span className="text-xs font-bold text-[#198929]">Aktif</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.role !== "owner" && u.id !== currentUserId && (
                      u.banned ? (
                        <button className="rounded-lg bg-[#198929] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#147522] disabled:opacity-50" disabled={pending} onClick={() => toggleAccount(u.id, "reactivate")}>Aktifkan</button>
                      ) : (
                        <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50" disabled={pending} onClick={() => toggleAccount(u.id, "deactivate")}>Nonaktifkan</button>
                      )
                    )}
                    {u.role === "owner" && <span className="text-xs text-[#5e6b61]">Owner</span>}
                    {u.id === currentUserId && u.role !== "owner" && <span className="text-xs text-[#5e6b61]">Anda</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}