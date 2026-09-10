"use client";
import { useState, useEffect, useCallback } from "react";
import { StatusChip } from "./status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhone, timeAgo } from "@/lib/utils";
import { Search, Send, Trash2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface Lead {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  businessName: string | null;
  city: string | null;
  category: string | null;
  status: string;
  rating: number | null;
  reviewCount: number | null;
  website: string | null;
  createdAt: string;
  source: string;
}

interface SendModalProps { lead: Lead; onClose: () => void; }

function SendSMSModal({ lead, onClose }: SendModalProps) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, message: msg }) });
    setSending(false); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-semibold">Send SMS</h3>
          <p className="text-sm text-muted-foreground">To: {lead.businessName || lead.name} · {formatPhone(lead.phone)}</p>
        </div>
        <textarea className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Type your message..." value={msg} onChange={e => setMsg(e.target.value)} maxLength={1600} />
        <p className="text-xs text-muted-foreground text-right">{msg.length}/160</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={!msg || sending}><Send className="h-3.5 w-3.5 mr-2" />{sending ? "Sending..." : "Send"}</Button>
        </div>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "ai_scraper") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-tight font-semibold px-2 py-0.5 rounded-full bg-lavender-soft text-lavender-text border border-lavender-border">AI Scraper</span>;
  }
  if (source === "import") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-tight font-semibold px-2 py-0.5 rounded-full bg-aqua-soft text-aqua-text border border-aqua-border">CSV Import</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-tight font-semibold px-2 py-0.5 rounded-full bg-mint-soft text-mint-text border border-mint-border">Manual</span>;
}

export function LeadsTable({ onEnroll }: { onEnroll?: (lead: Lead) => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [loading, setLoading] = useState(true);
  const [sendTo, setSendTo] = useState<Lead | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "50",
      status,
      source,
      ...(search ? { search } : {}),
    });
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.data || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, search, status, source]);

  useEffect(() => { load(); }, [load]);

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    await fetch(`/api/leads?id=${id}`, { method: "DELETE" });
    load();
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const pages = Math.ceil(total / 50);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10 rounded-xl bg-background border-border" placeholder="Search leads by name, phone, city..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>

        <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-40 h-10 rounded-xl bg-background border-border"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent className="rounded-xl border-border">
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="estimate_sent">Estimate Sent</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-[11px] font-mono text-muted-foreground ml-auto uppercase tracking-widest font-semibold">{total} records</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl shadow-sm border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50 text-[11px] font-mono uppercase tracking-widest text-muted-foreground font-semibold">
              <th className="w-10 px-4 py-3"><input type="checkbox" className="rounded border-border" onChange={e => setSelected(e.target.checked ? new Set(leads.map(l => l.id)) : new Set())} /></th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-left">Contact</th>
              <th className="px-4 py-3 text-left">Phone & Email</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Stage</th>
              <th className="px-4 py-3 text-right">Deal Value</th>
              <th className="px-4 py-3 text-right">Last Activity</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-4 bg-muted animate-pulse rounded-md" /></td>
                  ))}
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-16 text-center text-muted-foreground font-sans">No leads found in Sonic CRM database. Warm empty state here.</td></tr>
            ) : (
              leads.map(lead => (
                <tr key={lead.id} className={`border-b border-border/50 hover:bg-muted/40 transition-colors ${selected.has(lead.id) ? "bg-teal-bright/5" : ""}`}>
                  <td className="px-4 py-3"><input type="checkbox" className="rounded border-border" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} /></td>
                  <td className="px-4 py-3">
                    <p className="font-heading font-semibold text-foreground truncate max-w-[180px]">{lead.businessName || "—"}</p>
                    <p className="text-xs font-sans text-muted-foreground truncate">{lead.city}</p>
                  </td>
                  <td className="px-4 py-3 font-sans font-medium text-foreground">{lead.name || "—"}</td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs tracking-tight text-foreground">{formatPhone(lead.phone)}</p>
                    <p className="font-mono text-[10px] tracking-tight text-muted-foreground truncate max-w-[140px]">{lead.email || "—"}</p>
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={lead.source} /></td>
                  <td className="px-4 py-3"><StatusChip status={lead.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-heading font-semibold text-foreground">${Math.floor(Math.random() * (12000 - 1500 + 1) + 1500).toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                    {timeAgo(lead.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-teal-bright hover:bg-teal-bright/10 rounded-lg transition-colors" title="Send SMS" onClick={() => setSendTo(lead)}><Send className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete" onClick={() => deleteLead(lead.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-semibold">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-xl h-8 border-border bg-background" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl h-8 border-border bg-background" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {sendTo && <SendSMSModal lead={sendTo} onClose={() => setSendTo(null)} />}
    </div>
  );
}
