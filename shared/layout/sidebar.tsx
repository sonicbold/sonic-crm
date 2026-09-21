"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Search, Megaphone, Settings, Droplets, Inbox, BarChart3 } from "lucide-react";
import { cn } from "@/shared/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Database", icon: Users },
  { href: "/scraper", label: "Lead Scraper", icon: Search },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[250px] border-r border-sidebar-border bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="px-6 py-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-bright/10 text-teal-bright border border-teal-bright/20">
            <Droplets className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold tracking-tight text-white leading-none lowercase">sonic crm</p>
          </div>
        </div>
        <p className="text-[10px] font-mono text-sidebar-text/60 font-semibold uppercase tracking-[0.15em] ml-11">Operator Workspace</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2">
        <div className="px-3 mb-3">
          <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.1em] text-sidebar-text/50">Command Center</p>
        </div>
        <div className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors group",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-text hover:bg-sidebar-accent/50 hover:text-white"
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-copper rounded-r-full" />
                )}
                <div className="flex items-center gap-3">
                  <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-teal-bright" : "text-sidebar-text opacity-70 group-hover:text-teal-bright")} strokeWidth={1.5} />
                  <span className="font-sans">{label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 mt-auto">
        {/* User Profile */}
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-8 w-8 rounded-full bg-teal-bright/20 flex items-center justify-center text-teal-bright font-heading font-bold text-sm shrink-0 border border-teal-bright/30">
            SC
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">You</p>
            <p className="text-[10px] text-sidebar-text/70 truncate">Plumber marketing</p>
          </div>
          <Link href="/settings" className="text-sidebar-text/50 hover:text-white transition-colors p-1">
            <Settings className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
