"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { itemsForRole, type AppRole } from "./items";
import { NavIcon } from "./nav-icon";

export function MobileNav({ role, onMore }: { role: AppRole; onMore: () => void }) {
  const pathname = usePathname();
  const items = itemsForRole(role).filter((item) => item.mobile).slice(0, 4);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-[#dde5de] bg-white px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(23,32,25,0.08)] print:hidden md:hidden" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }} aria-label="Navigasi cepat">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-bold ${active ? "text-[#198929]" : "text-[#5e6b61]"}`} href={item.href} key={item.href}>
            <NavIcon icon={item.icon} />
            <span className="max-w-full truncate">{item.label.split(" /")[0]}</span>
          </Link>
        );
      })}
      <button className="flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-bold text-[#5e6b61]" type="button" onClick={onMore}>
        <span className="flex h-5 items-center text-xl leading-none" aria-hidden="true">...</span>
        <span>More</span>
      </button>
    </nav>
  );
}
