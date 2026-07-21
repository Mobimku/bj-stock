"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/(dashboard)/actions";
import { itemsForRole, type AppRole } from "./items";
import { NavIcon } from "./nav-icon";

export function MobileDrawer({
  role,
  email,
  open,
  onClose,
}: {
  role: AppRole;
  email: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 print:hidden md:hidden" role="dialog" aria-modal="true" aria-label="Menu lengkap">
      <button className="absolute inset-0 bg-black/45" type="button" aria-label="Tutup menu" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-[min(86vw,320px)] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#dde5de] p-5">
          <div><p className="font-black text-[#198929]">Menu BJ Stock</p><p className="mt-1 max-w-52 truncate text-xs text-[#5e6b61]">{email}</p></div>
          <button className="flex size-11 items-center justify-center rounded-xl bg-[#f7faf7] text-2xl" type="button" aria-label="Tutup menu" onClick={onClose}>x</button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Menu mobile lengkap">
          {itemsForRole(role).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link className={`flex items-center gap-3 rounded-xl px-4 py-3 font-bold ${active ? "bg-[#198929] text-white" : "text-[#172019] hover:bg-[#f7faf7]"}`} href={item.href} key={item.href} onClick={onClose}>
                <NavIcon icon={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[#dde5de] p-4">
          <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-[#198929]/10 px-3 py-1 text-xs font-bold uppercase text-[#147522]">{role}</span><form action={logout}><button className="rounded-xl px-4 py-2 font-bold text-[#c62828]" type="submit">Keluar</button></form></div>
        </div>
      </aside>
    </div>
  );
}
