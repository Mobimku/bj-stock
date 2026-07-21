import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const TABLES: { name: string; label: string; group: string }[] = [
  { name: "units", label: "Unit", group: "Stock" },
  { name: "bank_stock", label: "Bank Stock", group: "Stock" },
  { name: "upgrade_log", label: "Upgrade Log", group: "Stock" },
  { name: "sales", label: "Penjualan", group: "Sales" },
  { name: "warranty", label: "Garansi", group: "Sales" },
  { name: "warranty_claim", label: "Klaim Garansi", group: "Sales" },
  { name: "service_orders", label: "Order Servis", group: "Servis" },
  { name: "service_part_log", label: "Part Servis", group: "Servis" },
  { name: "customers", label: "Customer", group: "CRM" },
  { name: "finance_accounts", label: "Akun Finance", group: "Finance" },
  { name: "finance_transactions", label: "Transaksi Finance", group: "Finance" },
  { name: "receivables", label: "Piutang", group: "Finance" },
  { name: "finance_payments", label: "Pembayaran Piutang", group: "Finance" },
  { name: "returns", label: "Retur", group: "Finance" },
  { name: "bank_stock_restock", label: "Restock Log", group: "Finance" },
];

export default async function ExportPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.app_metadata.role !== "admin" && authData.user?.app_metadata.role !== "owner") redirect("/scan");

  const groups = [...new Set(TABLES.map((t) => t.group))];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff751f]">Backup</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Export data CSV</h1>
        <p className="mt-2 text-[#5e6b61]">Unduh data setiap tabel dalam format CSV untuk backup atau analisis eksternal.</p>
      </header>

      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#5e6b61]">{group}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TABLES.filter((t) => t.group === group).map((table) => (
                <a
                  key={table.name}
                  href={`/api/export/${table.name}`}
                  className="flex items-center justify-between rounded-2xl border border-[#dde5de] bg-white p-4 transition hover:border-[#198929] hover:shadow-md"
                >
                  <span className="font-bold text-[#172019]">{table.label}</span>
                  <span className="flex size-9 items-center justify-center rounded-xl bg-[#198929]/10 text-[#198929]" aria-hidden="true">
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M7 10l5 5 5-5" />
                      <path d="M12 15V3" />
                    </svg>
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 rounded-2xl bg-[#172019] p-5 text-sm text-white/80">
        File CSV akan terunduh dengan nama <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[#ffdc50]">[tabel]-[tanggal].csv</code>. Data diurutkan dari yang terbaru. Hanya admin yang dapat mengakses export ini.
      </p>
    </main>
  );
}
