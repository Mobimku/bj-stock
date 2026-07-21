import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/nav/app-sidebar";
import { MobileNavigation } from "@/components/nav/mobile-navigation";
import type { AppRole } from "@/components/nav/items";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  
  if (!session?.user) redirect("/login");
  
  const role = session.user.app_metadata?.role;
  if (role !== "admin" && role !== "teknisi" && role !== "owner") redirect("/login");
  
  const appRole = role as AppRole;

  return (
    <div className="dashboard-shell flex min-h-dvh flex-col bg-[#f7faf7] pb-[calc(4rem+env(safe-area-inset-bottom))] print:block print:min-h-0 print:overflow-visible print:pb-0 md:h-screen md:min-h-0 md:flex-row md:overflow-hidden md:pb-0">
      <div className="print:hidden"><AppSidebar role={appRole} email={session.user.email ?? ""} /></div>
      <MobileNavigation role={appRole} email={session.user.email ?? ""}>{children}</MobileNavigation>
    </div>
  );
}
