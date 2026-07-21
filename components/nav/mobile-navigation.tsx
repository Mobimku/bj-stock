"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { AppRole } from "./items";
import { MobileDrawer } from "./mobile-drawer";
import { MobileNav } from "./mobile-nav";

export function MobileNavigation({ role, email, children }: { role: AppRole; email: string; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="dashboard-frame flex min-w-0 flex-1 flex-col print:block print:overflow-visible md:min-h-0">
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-[#147522] bg-[#198929] px-4 text-white print:hidden md:hidden">
        <Link className="font-black tracking-tight" href="/units">BJ <span className="text-[#ffdc50]">STOCK</span></Link>
        <button className="flex size-11 flex-col items-center justify-center gap-1 rounded-xl border border-white/30" type="button" aria-label="Buka menu" onClick={() => setDrawerOpen(true)}>
          <span className="h-0.5 w-5 bg-white" />
          <span className="h-0.5 w-5 bg-white" />
          <span className="h-0.5 w-5 bg-white" />
        </button>
      </header>
      <div className="dashboard-content flex min-w-0 flex-1 flex-col print:block print:overflow-visible md:min-h-0 md:overflow-x-hidden md:overflow-y-auto">
        {children}
      </div>
      <MobileNav role={role} onMore={() => setDrawerOpen(true)} />
      <MobileDrawer role={role} email={email} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
