import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-stone-950 lg:grid-cols-[1.2fr_1fr]">
      <section className="hidden border-r border-white/10 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-amber-500">BJ Laptop</p>
        <div>
          <p className="max-w-xl text-5xl font-black leading-[1.05]">
            Satu tempat untuk unit, part, dan pekerjaan servis.
          </p>
          <p className="mt-6 text-stone-400">Bangunjiwo, Yogyakarta</p>
        </div>
      </section>
      <section className="grid place-items-center bg-[#f4f3ee] p-6 sm:p-12">
        <div className="w-full max-w-md">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-amber-700 lg:hidden">
            BJ Laptop
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Masuk ke BJ Stock</h1>
          <p className="mt-3 text-stone-600">Gunakan akun admin, teknisi, atau owner.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
