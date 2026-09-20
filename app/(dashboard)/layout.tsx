"use client";
import { Sidebar } from "@/shared/layout/sidebar";
import { DripRunner } from "@/features/campaigns/drip-runner-client";
import { NotificationBell } from "@/features/inbox/notification-bell";
import { RefreshCw } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <DripRunner />
      <main className="flex-1 pl-[250px] min-h-screen flex flex-col">
        <header className="h-[70px] border-b border-border bg-background flex items-center justify-between px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <p className="text-xs font-mono font-bold tracking-tight text-foreground uppercase">{date}</p>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-bright opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-bright"></span>
              </span>
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground font-semibold">US workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <button className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <NotificationBell />
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">Sonic CRM</p>
              <p className="text-xs font-sans text-muted-foreground">Plumber outreach workspace</p>
            </div>
          </div>
        </header>
        <div className="flex-1 p-8 max-w-[1200px] w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
