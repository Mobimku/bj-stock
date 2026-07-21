import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";
import logoBlack from "@/assets/logo-transparent.svg";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const statuses = ["Diterima", "Diagnosa", "Dikerjakan", "Selesai", "Diambil"] as const;
const publicServiceSchema = z.object({
  id_servis: z.string(),
  jenis_servis: z.string(),
  brand_model: z.string(),
  status: z.enum(statuses),
  tanggal_masuk: z.string(),
  estimasi_selesai: z.string().nullable(),
  tanggal_selesai: z.string().nullable(),
  tanggal_diambil: z.string().nullable(),
  garansi_servis_hari: z.number(),
});

export default async function PublicServicePage({ params }: { params: Promise<{ id_servis: string }> }) {
  const { id_servis } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_service", { p_public_slug: id_servis }).maybeSingle();
  const order = publicServiceSchema.safeParse(data);
  if (error || !order.success) notFound();
  const currentIndex = statuses.indexOf(order.data.status);
  const warrantyEnd = order.data.tanggal_diambil ? addDays(order.data.tanggal_diambil, order.data.garansi_servis_hari) : null;

  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-8 text-[#172019] sm:py-14">
      <article className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-[#dde5de] bg-white shadow-xl shadow-[#198929]/5">
        <header className="bg-[#198929] p-7 text-white sm:p-9">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-white p-2"><Image className="h-16 w-auto object-contain" src={logoBlack} alt="BJ Laptop" priority /></div>
            <div><p className="text-xl font-black">BJ Laptop</p><p className="text-sm text-white/70">Status servis publik</p></div>
          </div>
          <p className="mt-8 font-mono text-sm font-bold text-[#ffdc50]">{order.data.id_servis}</p>
          <h1 className="mt-2 text-3xl font-black">{order.data.brand_model}</h1>
          <p className="mt-2 text-white/75">{order.data.jenis_servis}</p>
        </header>

        <div className="p-7 sm:p-9">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#5e6b61]">Status saat ini</p><h2 className="mt-2 text-3xl font-black text-[#198929]">{order.data.status}</h2></div>
            <p className="text-right text-sm text-[#5e6b61]">Masuk<br /><strong className="text-[#172019]">{formatDate(order.data.tanggal_masuk)}</strong></p>
          </div>

          <div className="mt-8 grid grid-cols-5 gap-2">
            {statuses.map((status, index) => (
              <div className="text-center" key={status}>
                <div className={`mx-auto h-2.5 rounded-full ${index <= currentIndex ? "bg-[#ff751f]" : "bg-[#dde5de]"}`} />
                <p className="mt-2 hidden text-[11px] font-bold text-[#5e6b61] sm:block">{status}</p>
              </div>
            ))}
          </div>

          <section className="mt-8 rounded-2xl bg-[#f7faf7] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#5e6b61]">Informasi waktu</p>
            {order.data.status === "Diambil" && order.data.tanggal_diambil ? (
              <p className="mt-2 font-black">Perangkat diambil {formatDate(order.data.tanggal_diambil)}</p>
            ) : order.data.status === "Selesai" && order.data.tanggal_selesai ? (
              <p className="mt-2 font-black">Selesai dikerjakan {formatDate(order.data.tanggal_selesai)}</p>
            ) : order.data.estimasi_selesai ? (
              <p className="mt-2 font-black">Estimasi selesai {formatDate(order.data.estimasi_selesai)}</p>
            ) : (
              <p className="mt-2 font-medium text-[#5e6b61]">Estimasi selesai belum ditentukan.</p>
            )}
          </section>

          {warrantyEnd && (
            <section className="mt-4 rounded-2xl bg-[#ffdc50]/35 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Garansi servis</p>
              <p className="mt-2 font-black">Berlaku sampai {formatDate(warrantyEnd)}</p>
            </section>
          )}

          <p className="mt-8 text-center text-xs leading-5 text-[#5e6b61]">Halaman ini tidak menampilkan data customer, diagnosa internal, atau biaya modal.</p>
        </div>
      </article>
    </main>
  );
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
