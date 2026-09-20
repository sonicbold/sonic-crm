"use client";
import { useState, useEffect, useCallback } from "react";
import { CampaignBuilder } from "@/features/campaigns/campaign-builder";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog";
import { Plus, Play, Pause, Trash2, Users, Zap, Square } from "lucide-react";
import { parseCampaignMessage } from "@/shared/utils";
import { toast } from "@/shared/ui/use-toast";

interface DripCounts {
  queued: number; scheduled: number; sent: number; failed: number; cancelled: number;
}

interface Campaign {
  id: string; name: string; description: string | null; status: string;
  steps: string; createdAt: string; targetCount: number;
  _count: { campaignLeads: number; messages: number };
  dripCounts?: DripCounts;
}

interface Progress {
  campaignStatus: string;
  inWindow: boolean;
  resumesAt: string | null;
  timezone: string;
  window: string;
  counts: { queued: number; scheduled: number; sent: number; failed: number; remaining: number; total: number };
  nextSend: string | null;
  estimatedLastSend: string | null;
  upcoming: { id: string; at: string | null; lead: string; status: string }[];
}

const statusColors: Record<string, "success" | "info" | "warning" | "muted" | "destructive"> = {
  active: "success", draft: "muted", paused: "warning", completed: "info", stopped: "destructive",
};

function DripPanel({ campaignId, status }: { campaignId: string; status: string }) {
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const res = await fetch(`/api/campaigns/progress?id=${campaignId}`);
      if (!res.ok || !live) return;
      setProgress(await res.json());
    };
    load();
    const id = setInterval(load, 4000);
    return () => { live = false; clearInterval(id); };
  }, [campaignId]);

  if (!progress || status === "draft") return null;
  const c = progress.counts;
  const total = Math.max(1, c.total);
  const pct = Math.round((c.sent / total) * 100);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-4 text-[11px] font-mono text-muted-foreground">
        <span><strong className="text-foreground">{c.remaining}</strong> remaining</span>
        <span><strong className="text-foreground">{c.sent}</strong> sent</span>
        <span><strong className="text-foreground">{c.scheduled}</strong> scheduled</span>
        <span><strong className="text-foreground">{c.queued}</strong> queued</span>
        {c.failed > 0 && <span className="text-rose-text"><strong>{c.failed}</strong> failed</span>}
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-copper transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs font-sans text-muted-foreground">
        Window {progress.window} ({progress.timezone}).
        {progress.inWindow ? " Sending now." : ` Paused until ${progress.resumesAt}.`}
        {progress.nextSend ? ` Next: ${progress.nextSend}.` : ""}
        {progress.estimatedLastSend && progress.estimatedLastSend !== "Done" ? ` Last estimated: ${progress.estimatedLastSend}.` : ""}
      </p>
      {progress.upcoming.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Upcoming sends</p>
          {progress.upcoming.map((u) => (
            <div key={u.id} className="flex justify-between gap-3 text-xs">
              <span className="truncate">{u.lead}</span>
              <span className="font-mono text-muted-foreground shrink-0">{u.at}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<{ id: string; businessName: string | null; name: string | null; phone: string; status: string }[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [smsCount, setSmsCount] = useState(1);
  const [preview, setPreview] = useState<{ firstSend?: string | null; lastSend?: string | null; days?: number; sample?: string[] } | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!enrollOpen) return;
    const n = Math.min(smsCount, selectedLeads.size || smsCount);
    if (n < 1) { setPreview(null); return; }
    fetch(`/api/campaigns/schedule-preview?count=${n}`)
      .then((r) => r.json())
      .then(setPreview)
      .catch(() => {});
  }, [enrollOpen, smsCount, selectedLeads.size]);

  async function control(id: string, action: "pause" | "resume" | "stop") {
    const res = await fetch("/api/campaigns/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Could not update campaign", description: data.error, variant: "destructive" });
      return;
    }
    toast({ title: action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Stopped" });
    load();
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    const res = await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast({ title: "Error deleting", description: data.error, variant: "destructive" });
      return;
    }
    toast({ title: "Campaign deleted" });
    load();
  }

  async function openEnroll(campaign: Campaign) {
    setEnrollOpen(campaign);
    const res = await fetch("/api/leads?limit=500&status=new&unenrolled=true");
    const data = await res.json();
    const list = data.data || [];
    setLeads(list);
    setSelectedLeads(new Set());
    setSmsCount(Math.min(25, list.length || 1));
  }

  async function enrollLeads() {
    if (!enrollOpen || !selectedLeads.size) return;
    setEnrolling(true);
    const ids = Array.from(selectedLeads).slice(0, smsCount);
    const res = await fetch("/api/campaigns/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: enrollOpen.id, leadIds: ids, count: smsCount }),
    });
    const data = await res.json();
    setEnrolling(false);
    if (!res.ok) {
      toast({ title: "Could not start drip", description: data.error || "Failed", variant: "destructive" });
      return;
    }
    setEnrollOpen(null);
    toast({
      title: `Queued ${data.enrolled} SMS`,
      description: data.plan?.firstSend
        ? `First ~ ${data.plan.firstSend}. Last ~ ${data.plan.lastSend}. Spreading across 9 AM–7 PM.`
        : "Strategic Drip started.",
    });
    load();
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Outreach</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">
            Strategic Drip: one SMS per lead, spaced with random delays between 9:00 AM and 7:00 PM. Leftovers continue at 9 AM the next day.
          </p>
        </div>
        <Button className="rounded-xl h-10 bg-copper hover:bg-copper-hover text-white transition-all font-semibold px-5" onClick={() => setBuilderOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Create Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-2xl text-muted-foreground bg-card">
          <Zap className="h-10 w-10 mb-3 text-muted-foreground/40" />
          <p className="font-heading font-semibold text-foreground">No campaigns yet</p>
          <p className="text-sm font-sans mt-1">Write one message, queue leads, and let Strategic Drip pace the sends</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {
            const message = parseCampaignMessage(c.steps);
            const statusColor = statusColors[c.status] || "muted";
            return (
              <Card key={c.id} className="rounded-2xl shadow-sm border-border bg-card hover:border-copper/40 transition-colors">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-heading font-semibold text-lg text-foreground truncate">{c.name}</h3>
                        <Badge variant={statusColor as any} className="uppercase tracking-widest text-[10px]">{c.status}</Badge>
                      </div>
                      <div className="p-3 bg-muted/40 rounded-xl border border-border/50 max-w-2xl">
                        <p className="text-sm font-sans text-muted-foreground line-clamp-2">&quot;{message || "No message"}&quot;</p>
                      </div>
                      <DripPanel campaignId={c.id} status={c.status} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6">
                      {(c.status === "draft" || c.status === "completed") && (
                        <Button size="sm" variant="outline" className="rounded-xl border-border bg-background" onClick={() => openEnroll(c)}>
                          <Users className="h-4 w-4 mr-2" />Queue drip
                        </Button>
                      )}
                      {c.status === "active" && (
                        <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" title="Pause" onClick={() => control(c.id, "pause")}>
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {c.status === "paused" && (
                        <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" title="Resume" onClick={() => control(c.id, "resume")}>
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {(c.status === "active" || c.status === "paused") && (
                        <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-rose-text" title="Stop" onClick={() => control(c.id, "stop")}>
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-rose-text hover:bg-rose-soft" onClick={() => deleteCampaign(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CampaignBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} onSave={load} />

      <Dialog open={!!enrollOpen} onOpenChange={() => setEnrollOpen(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] rounded-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Strategic Drip</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">How many SMS to send</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, selectedLeads.size || leads.length)}
                value={smsCount}
                onChange={(e) => setSmsCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">Picks that many from your selected leads. Spacing is calculated for you.</p>
            </div>
            {preview && preview.firstSend && (
              <div className="rounded-xl border border-aqua-border bg-aqua-soft/40 p-3 text-xs text-aqua-text space-y-1">
                <p><strong>Estimated schedule</strong> (9 AM–7 PM, jittered)</p>
                <p>First ~ {preview.firstSend}</p>
                <p>Last ~ {preview.lastSend}{preview.days && preview.days > 1 ? ` · ${preview.days} days` : ""}</p>
                {preview.sample?.length ? <p className="text-muted-foreground">Sample times: {preview.sample.join(" · ")}</p> : null}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm font-sans text-muted-foreground">Select new leads (each is texted once)</p>
              <Button variant="ghost" size="sm" className="h-8 rounded-xl" onClick={() => {
                const all = new Set(leads.map((l) => l.id));
                setSelectedLeads(all);
                setSmsCount(all.size || 1);
              }}>Select all</Button>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-64">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-colors ${selectedLeads.has(lead.id) ? "border-copper bg-copper/5" : "border-border bg-background hover:bg-muted/30"}`}
                  onClick={() => setSelectedLeads((prev) => {
                    const n = new Set(prev);
                    n.has(lead.id) ? n.delete(lead.id) : n.add(lead.id);
                    setSmsCount((c) => {
                      const size = n.size;
                      return Math.min(Math.max(c, 1), Math.max(size, 1));
                    });
                    return n;
                  })}
                >
                  <input type="checkbox" className="rounded border-border" checked={selectedLeads.has(lead.id)} onChange={() => {}} />
                  <div>
                    <p className="text-sm font-sans font-medium text-foreground">{lead.businessName || lead.name || lead.phone}</p>
                    <p className="text-[11px] font-mono tracking-tight text-muted-foreground mt-0.5">{lead.phone}</p>
                  </div>
                </div>
              ))}
              {leads.length === 0 && <p className="text-center text-muted-foreground text-sm font-sans py-8">No fresh leads. Import or scrape first.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl border-border" onClick={() => setEnrollOpen(null)}>Cancel</Button>
            <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={enrollLeads} disabled={!selectedLeads.size || enrolling}>
              {enrolling ? "Queuing..." : `Start drip (${Math.min(smsCount, selectedLeads.size)} SMS)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
