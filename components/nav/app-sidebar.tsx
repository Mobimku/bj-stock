"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(dashboard)/actions";
import { itemsForRole, type AppRole } from "./items";
import { NavIcon } from "./nav-icon";

export function AppSidebar({ role, email }: { role: AppRole; email: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col overflow-hidden bg-[#198929] text-white md:flex md:h-screen">
      <Link className="shrink-0 border-b border-white/15 px-6 py-6 text-xl font-black tracking-tight" href="/units">
        BJ <span className="text-[#ffdc50]">STOCK</span>
      </Link>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-4" aria-label="Navigasi utama">
        {itemsForRole(role).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${active ? "bg-white text-[#147522]" : "text-white/85 hover:bg-white/10 hover:text-white"}`} href={item.href} key={item.href}>
              <NavIcon icon={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-white/15 p-4">
        <p className="truncate text-xs text-white/70">{email}</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="rounded-full border border-white/30 px-2 py-1 text-xs font-bold uppercase">{role}</span>
          <form action={logout}><button className="text-sm font-bold hover:text-[#ffdc50]" type="submit">Keluar</button></form>
        </div>
      </div>
    </aside>
  );
}
