export type AppRole = "admin" | "teknisi" | "owner";

export type NavItem = {
  href: string;
  label: string;
  icon: "scan" | "unit" | "stock" | "sales" | "warranty" | "service" | "customer" | "finance" | "dashboard" | "report" | "export" | "help" | "settings";
  roles: AppRole[];
  mobile: boolean;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ["admin", "owner"], mobile: false },
  { href: "/scan", label: "Scan", icon: "scan", roles: ["admin", "teknisi", "owner"], mobile: true },
  { href: "/units", label: "Unit / Upgrade", icon: "unit", roles: ["admin", "teknisi", "owner"], mobile: true },
  { href: "/sales", label: "Sales", icon: "sales", roles: ["admin", "owner"], mobile: true },
  { href: "/service", label: "Servis", icon: "service", roles: ["admin", "teknisi", "owner"], mobile: true },
  { href: "/bank-stock", label: "Bank Stock", icon: "stock", roles: ["admin", "owner"], mobile: false },
  { href: "/warranty", label: "Garansi", icon: "warranty", roles: ["admin", "owner"], mobile: false },
  { href: "/customers", label: "Customer", icon: "customer", roles: ["admin", "owner"], mobile: false },
  { href: "/finance", label: "Finance", icon: "finance", roles: ["admin", "owner"], mobile: false },
  { href: "/reports", label: "Laporan", icon: "report", roles: ["admin", "owner"], mobile: false },
  { href: "/settings", label: "Pengaturan", icon: "settings", roles: ["owner"], mobile: false },
];

export const itemsForRole = (role: AppRole) => navItems.filter((item) => item.roles.includes(role));
