"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; name: string };
type Transaction = { id: string; label: string };

const fieldClass = "mt-2 w-full rounded-xl border border-[#dde5de] bg-white px-4 py-3 text-base text-[#172019] outline-none focus:border-[#198929] focus:ring-2 focus:ring-[#198929]/20";

export function FinanceForms({
  accounts,
  transactions,
  today,
  isOwner,
}: {
  accounts: Account[];
  transactions: Transaction[];
  today: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const paymentKeys = useRef<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload: Record<string, string> = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") payload[key] = value;
    });
    const paymentKey = `${payload.action}:${payload.sourceId}`;
    if (payload.action === "salePayment" || payload.action === "servicePayment") {
      payload.eventKey = paymentKeys.current[paymentKey] ??= crypto.randomUUID();
    }

    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Transaksi Finance gagal disimpan.");
        return;
      }
      delete paymentKeys.current[paymentKey];
      form.reset();
      setMessage("Transaksi Finance berhasil disimpan.");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Coba kirim ulang tanpa mengubah data.");
    } finally {
      setPending(false);
    }
  }

  const button = (
    <button className="mt-5 w-full rounded-xl bg-[#198929] px-5 py-3 font-black text-white hover:bg-[#147522] disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Memproses..." : "Simpan transaksi"}
    </button>
  );

  return (
    <section className="mt-8 rounded-3xl bg-[#172019] p-4 text-white sm:p-6">
      <div className="px-2 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffdc50]">Input Admin</p>
        <h2 className="mt-2 text-2xl font-black">Catat peristiwa keuangan</h2>
        <p className="mt-1 text-sm text-white/65">Pilih satu formulir. Semua nominal divalidasi ulang di database.</p>
      </div>

      {error && <p className="mx-2 mt-4 rounded-xl bg-red-950 p-4 text-sm text-red-100" role="alert">{error}</p>}
      {message && <p className="mx-2 mt-4 rounded-xl bg-emerald-900 p-4 text-sm text-emerald-50" role="status">{message}</p>}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <FinanceForm title="Biaya operasional" description="Listrik, sewa, internet, transportasi, dan biaya non-stok." onSubmit={submit}>
          <input name="action" type="hidden" value="opex" />
          <MoneyField />
          <DateField today={today} />
          <AccountField accounts={accounts} />
          <NotesField label="Catatan biaya" />
          {button}
        </FinanceForm>

        <FinanceForm title="Modal disetor" description="Dana pribadi atau eksternal yang masuk ke kas usaha." onSubmit={submit}>
          <input name="action" type="hidden" value="capital" />
          <MoneyField />
          <DateField today={today} />
          <AccountField accounts={accounts} />
          <NotesField label="Sumber dana" />
          {button}
        </FinanceForm>

        <FinanceForm title="Bayar cicilan Sales" description="Hanya invoice dengan metode bayar Cicilan." onSubmit={submit}>
          <input name="action" type="hidden" value="salePayment" />
          <TextField label="ID invoice" name="sourceId" placeholder="INV-2608-001" />
          <MoneyField />
          <AccountField accounts={accounts} />
          {button}
        </FinanceForm>

        <FinanceForm title="Pembayaran servis" description="Catat uang saat benar-benar diterima, bukan saat status berubah." onSubmit={submit}>
          <input name="action" type="hidden" value="servicePayment" />
          <TextField label="ID servis" name="sourceId" placeholder="SVC-2607-002" />
          <MoneyField />
          <AccountField accounts={accounts} />
          {button}
        </FinanceForm>

        {isOwner && (
        <FinanceForm title="Proses retur" description="Refund, status unit, dan garansi diproses atomik." onSubmit={submit}>
          <input name="action" type="hidden" value="return" />
          <label className="block text-sm font-bold text-white/80">Jenis sumber
            <select className={fieldClass} name="sourceType" defaultValue="Sales" required><option>Sales</option><option>Servis</option></select>
          </label>
          <TextField label="ID invoice / servis" name="sourceId" placeholder="INV-... / SVC-..." />
          <MoneyField label="Jumlah refund" />
          <AccountField accounts={accounts} label="Akun refund" />
          <NotesField label="Alasan retur" />
          {button}
        </FinanceForm>
        )}

        {isOwner && (
        <FinanceForm title="Reversal transaksi" description="Koreksi jurnal tanpa mengubah atau menghapus transaksi asli." onSubmit={submit}>
          <input name="action" type="hidden" value="reversal" />
          <label className="block text-sm font-bold text-white/80">Transaksi asli
            <select className={fieldClass} name="transactionId" defaultValue="" required>
              <option value="" disabled>Pilih transaksi</option>
              {transactions.map((transaction) => <option value={transaction.id} key={transaction.id}>{transaction.label}</option>)}
            </select>
          </label>
          <NotesField label="Alasan koreksi" />
          {button}
        </FinanceForm>
        )}
      </div>
    </section>
  );
}

function FinanceForm({ title, description, onSubmit, children }: { title: string; description: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-white/10 bg-white/5 open:bg-white/10">
      <summary className="cursor-pointer list-none p-5 marker:hidden">
        <span className="flex items-center justify-between gap-3"><span className="font-black">{title}</span><span className="text-xl text-[#ffdc50] group-open:rotate-45">+</span></span>
        <span className="mt-1 block text-sm text-white/60">{description}</span>
      </summary>
      <form className="grid gap-4 border-t border-white/10 p-5" onSubmit={onSubmit}>{children}</form>
    </details>
  );
}

function AccountField({ accounts, label = "Akun" }: { accounts: Account[]; label?: string }) {
  return <label className="block text-sm font-bold text-white/80">{label}<select className={fieldClass} name="accountId" required>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>;
}

function MoneyField({ label = "Jumlah" }: { label?: string }) {
  return <label className="block text-sm font-bold text-white/80">{label}<input className={fieldClass} name="amount" inputMode="numeric" min="1" step="1" type="number" required /></label>;
}

function DateField({ today }: { today: string }) {
  return <label className="block text-sm font-bold text-white/80">Tanggal<input className={fieldClass} name="date" type="date" defaultValue={today} required /></label>;
}

function TextField({ label, name, placeholder }: { label: string; name: string; placeholder: string }) {
  return <label className="block text-sm font-bold text-white/80">{label}<input className={fieldClass} name={name} maxLength={100} placeholder={placeholder} required /></label>;
}

function NotesField({ label }: { label: string }) {
  return <label className="block text-sm font-bold text-white/80">{label}<textarea className={fieldClass} name="notes" maxLength={500} rows={3} required /></label>;
}
