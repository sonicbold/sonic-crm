"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

interface Item {
  id: string;
  title: string;
  body: string;
  read: boolean;
  type: string;
  createdAt: string;
  lead?: { id: string } | null;
}

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  async function load() {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    setUnread(data.unread || 0);
    setItems(data.items || []);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    load();
  }

  return (
    <div className="relative">
      <button
        className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors relative"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" strokeWidth={1.5} />
        {unread > 0 && <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-copper" />}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-80 rounded-xl border border-border bg-card shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Alerts</p>
            <button className="text-[11px] text-copper" onClick={markAll}>Mark all read</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href="/inbox"
                  className={`block px-3 py-2.5 border-b border-border/60 hover:bg-muted/40 ${n.read ? "" : "bg-copper/5"}`}
                  onClick={() => setOpen(false)}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
