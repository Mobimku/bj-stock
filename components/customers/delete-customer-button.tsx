"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCustomerButton({ idCustomer }: { idCustomer: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/customers/${idCustomer}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Gagal menghapus customer." }));
      setError(body.error);
      setLoading(false);
      return;
    }
    // Redirect to customer list
    router.push("/customers");
  }

  return (
    <>
      <button className="rounded-xl border-2 border-red-600 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50" onClick={() => setOpen(true)} type="button">Hapus</button>
      {open && (
        <dialog className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 open:flex" open onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-lg font-black">Hapus customer?</p>
            <p className="mt-2 text-sm text-stone-600">Data customer akan dihapus permanen. Aksi ini tidak bisa dibatalkan. Customer dengan riwayat transaksi (pembelian/servis) tidak dapat dihapus.</p>
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-xl px-4 py-2 font-bold text-stone-600 hover:bg-stone-100" disabled={loading} onClick={() => setOpen(false)} type="button">Batal</button>
              <button className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50" disabled={loading} onClick={handleDelete} type="button">{loading ? "Menghapus..." : "Ya, hapus"}</button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
