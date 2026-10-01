"use client";
import { useState, useEffect, useCallback } from "react";
import { StatusChip } from "@/shared/layout/status-chip";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { formatPhone, timeAgo, businessLink, toHttpUrl } from "@/shared/utils";
import { WebsiteStatusBadge } from "@/features/leads/website-status-badge";
import { Search, Send, Trash2, ChevronLeft, ChevronRight, ExternalLink, Pencil } from "lucide-react";
import { toast } from "@/shared/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";

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
  websiteStatus?: string | null;
  googleMapsUrl: string | null;
  address?: string | null;
  state?: string | null;
  notes?: string | null;
  createdAt: string;
  source: string;
}

interface SendModalProps { lead: Lead; onClose: () => void; }

function SendSMSModal({ lead, onClose }: SendModalProps) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, message: msg }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SMS failed");
      toast({ title: "SMS sent" });
      onClose();
    } catch (err: unknown) {
      toast({ title: "SMS failed", description: err instanceof Error ? err.message : "Could not send", variant: "destructive" });
    } finally {
      setSending(false);
    }
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

function EditLeadModal({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const [form, setForm] = useState({
    businessName: lead.businessName || "",
    name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    city: lead.city || "",
    state: lead.state || "",
    address: lead.address || "",
    website: lead.website || "",
    googleMapsUrl: lead.googleMapsUrl || "",
    status: lead.status || "new",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.phone.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          businessName: form.businessName.trim() || null,
          name: form.name.trim() || null,
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          address: form.address.trim() || null,
          website: form.website.trim() || null,
          status: form.status,
          googleMapsUrl: form.googleMapsUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      toast({ title: "Lead updated" });
      onSaved(data);
      onClose();
    } catch (err: unknown) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg rounded-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Edit lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Business name</Label>
            <Input className="bg-background border-border rounded-xl h-10" value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Contact name</Label>
            <Input className="bg-background border-border rounded-xl h-10" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Phone</Label>
              <Input className="bg-background border-border rounded-xl h-10" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Email</Label>
              <Input className="bg-background border-border rounded-xl h-10" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">City</Label>
              <Input className="bg-background border-border rounded-xl h-10" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">State</Label>
              <Input className="bg-background border-border rounded-xl h-10" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Address</Label>
            <Input className="bg-background border-border rounded-xl h-10" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Website</Label>
            <Input className="bg-background border-border rounded-xl h-10" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Google Maps / GBP</Label>
            <Input className="bg-background border-border rounded-xl h-10" value={form.googleMapsUrl} onChange={(e) => setForm((f) => ({ ...f, googleMapsUrl: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Stage</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="h-10 rounded-xl bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl border-border">
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="not_interested">Not interested</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl border-border" onClick={onClose}>Cancel</Button>
          <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={save} disabled={!form.phone.trim() || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "ai_scraper" || source === "finder") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-tight font-semibold px-2 py-0.5 rounded-full bg-lavender-soft text-lavender-text border border-lavender-border">Finder</span>;
  }
  if (source === "import" || source === "csv_import") {
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
  const [website, setWebsite] = useState("any");
  const [source, setSource] = useState("all");
  const [loading, setLoading] = useState(true);
  const [sendTo, setSendTo] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "50",
      status,
      source,
      website,
      ...(search ? { search } : {}),
    });
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.data || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, search, status, source, website]);

  useEffect(() => { load(); }, [load]);

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    const res = await fetch(`/api/leads?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "Delete failed", description: data.error || "Could not delete lead", variant: "destructive" });
      return;
    }
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setLeads(prev => prev.filter(l => l.id !== id));
    setTotal(t => Math.max(0, t - 1));
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const label = ids.length === 1 ? "Delete 1 selected lead?" : `Delete ${ids.length} selected leads?`;
    if (!confirm(label)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete leads");
      const removed = new Set(ids);
      setLeads(prev => prev.filter(l => !removed.has(l.id)));
      setTotal(t => Math.max(0, t - (data.deleted ?? ids.length)));
      setSelected(new Set());
      toast({ title: `Deleted ${data.deleted ?? ids.length} lead${(data.deleted ?? ids.length) === 1 ? "" : "s"}` });
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Could not delete", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const allOnPageSelected = leads.length > 0 && leads.every(l => selected.has(l.id));
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
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="not_interested">Not interested</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={website} onValueChange={v => { setWebsite(v); setPage(1); }}>
          <SelectTrigger className="w-44 h-10 rounded-xl bg-background border-border"><SelectValue placeholder="Website" /></SelectTrigger>
          <SelectContent className="rounded-xl border-border">
            <SelectItem value="any">All websites</SelectItem>
            <SelectItem value="with">Has Website</SelectItem>
            <SelectItem value="without">No Website</SelectItem>
            <SelectItem value="uncertain">Uncertain</SelectItem>
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold"
            onClick={deleteSelected}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? "Deleting..." : `Delete selected (${selected.size})`}
          </Button>
        )}

        <span className="text-[11px] font-mono text-muted-foreground ml-auto uppercase tracking-widest font-semibold">{total} records</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl shadow-sm border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50 text-[11px] font-mono uppercase tracking-widest text-muted-foreground font-semibold">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={allOnPageSelected}
                  onChange={e => setSelected(e.target.checked ? new Set(leads.map(l => l.id)) : new Set())}
                  aria-label="Select all on this page"
                />
              </th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-left">Website</th>
              <th className="px-4 py-3 text-left">GBP</th>
              <th className="px-4 py-3 text-left">Contact</th>
              <th className="px-4 py-3 text-left">Phone & Email</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Stage</th>
              <th className="px-4 py-3 text-right">Added</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-4 bg-muted animate-pulse rounded-md" /></td>
                  ))}
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-16 text-center text-muted-foreground font-sans">No leads yet. Import a CSV or run the scraper.</td></tr>
            ) : (
              leads.map(lead => {
                const site = lead.websiteStatus === "has_website" ? businessLink({ website: lead.website }) : null;
                const gbp = toHttpUrl(lead.googleMapsUrl);
                return (
                <tr key={lead.id} className={`border-b border-border/50 hover:bg-muted/40 transition-colors ${selected.has(lead.id) ? "bg-teal-bright/5" : ""}`}>
                  <td className="px-4 py-3"><input type="checkbox" className="rounded border-border" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} /></td>
                  <td className="px-4 py-3">
                    <p className="font-heading font-semibold text-foreground truncate max-w-[180px]">{lead.businessName || "—"}</p>
                    <p className="text-xs font-sans text-muted-foreground truncate">{lead.city}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1 max-w-[180px]">
                      <WebsiteStatusBadge status={lead.websiteStatus} />
                      {site ? (
                        <a
                          href={site.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-copper hover:underline max-w-full"
                          title={site.href}
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{site.label}</span>
                        </a>
                      ) : lead.websiteStatus === "uncertain" && lead.website ? (
                        <span className="text-[10px] text-muted-foreground truncate max-w-full" title={lead.website}>{lead.website}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {gbp ? (
                      <a
                        href={gbp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-copper hover:underline"
                        title={gbp}
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        GBP
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-sans font-medium text-foreground">{lead.name || "—"}</td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs tracking-tight text-foreground">{formatPhone(lead.phone)}</p>
                    <p className="font-mono text-[10px] tracking-tight text-muted-foreground truncate max-w-[140px]">{lead.email || "—"}</p>
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={lead.source} /></td>
                  <td className="px-4 py-3"><StatusChip status={lead.status} /></td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                    {timeAgo(lead.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Edit" onClick={() => setEditLead(lead)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-teal-bright hover:bg-teal-bright/10 rounded-lg transition-colors" title="Send SMS" onClick={() => setSendTo(lead)}><Send className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete" onClick={() => deleteLead(lead.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              );})
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
      {editLead && (
        <EditLeadModal
          lead={editLead}
          onClose={() => setEditLead(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))}
        />
      )}
    </div>
  );
}
