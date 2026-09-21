"use client";
import { useState, useEffect, useCallback } from "react";
import { CampaignBuilder } from "@/features/campaigns/campaign-builder";
import { CampaignLeadPicker } from "@/features/campaigns/lead-picker";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Plus, Play, Pause, Trash2, Users, Zap, Square, ArrowLeft } from "lucide-react";
import { parseCampaignMessages } from "@/shared/utils";
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
  const [mode, setMode] = useState<"list" | "create" | "enroll">("list");
  const [enrollOpen, setEnrollOpen] = useState<Campaign | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
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
    if (mode !== "enroll" || !selectedLeads.size) { setPreview(null); return; }
    fetch(`/api/campaigns/schedule-preview?count=${selectedLeads.size}`)
      .then((r) => r.json())
      .then(setPreview)
      .catch(() => {});
  }, [mode, selectedLeads.size]);

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

  function openEnroll(campaign: Campaign) {
    setEnrollOpen(campaign);
    setSelectedLeads(new Set());
    setPreview(null);
    setMode("enroll");
  }

  async function enrollLeads() {
    if (!enrollOpen || !selectedLeads.size) return;
    setEnrolling(true);
    const res = await fetch("/api/campaigns/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: enrollOpen.id, leadIds: Array.from(selectedLeads) }),
    });
    const data = await res.json();
    setEnrolling(false);
    if (!res.ok) {
      toast({ title: "Could not start drip", description: data.error || "Failed", variant: "destructive" });
      return;
    }
    toast({
      title: `Queued ${data.enrolled} SMS`,
      description: data.plan?.firstSend
        ? `First ~ ${data.plan.firstSend}. Last ~ ${data.plan.lastSend}. Spreading across 9 AM–7 PM.`
        : "Strategic Drip started.",
    });
    setMode("list");
    setEnrollOpen(null);
    load();
  }

  if (mode === "create") {
    return (
      <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
        <div>
          <button type="button" className="text-xs font-mono text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1" onClick={() => setMode("list")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
          </button>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Outreach</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight">New campaign</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">
            Write the SMS, filter Has website / No website, check the leads, then queue the 9 AM–7 PM drip.
          </p>
        </div>
        <Card className="rounded-2xl border-border bg-card">
          <CardContent className="p-6">
            <CampaignBuilder
              onCancel={() => setMode("list")}
              onSave={() => { load(); setMode("list"); }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "enroll" && enrollOpen) {
    const messages = parseCampaignMessages(enrollOpen.steps);
    return (
      <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
        <div>
          <button type="button" className="text-xs font-mono text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1" onClick={() => { setMode("list"); setEnrollOpen(null); }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to campaigns
          </button>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Outreach</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight">Select leads</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">
            {enrollOpen.name}: filter who has a website vs who does not, then check who gets this SMS.
          </p>
        </div>
        <Card className="rounded-2xl border-border bg-card">
          <CardContent className="p-6 space-y-4">
            <div className="p-3 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-sm text-muted-foreground line-clamp-3">A: &quot;{messages[0] || "No message"}&quot;{messages[1] ? ` · B: "${messages[1]}"` : ""}</p>
            </div>
            <CampaignLeadPicker
              campaignId={enrollOpen.id}
              selected={selectedLeads}
              onSelectedChange={setSelectedLeads}
            />
            {preview && preview.firstSend && (
              <div className="rounded-xl border border-aqua-border bg-aqua-soft/40 p-3 text-xs text-aqua-text space-y-1">
                <p><strong>Estimated schedule</strong> (9 AM–7 PM, jittered)</p>
                <p>First ~ {preview.firstSend}</p>
                <p>Last ~ {preview.lastSend}{preview.days && preview.days > 1 ? ` · ${preview.days} days` : ""}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => { setMode("list"); setEnrollOpen(null); }}>Cancel</Button>
              <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={enrollLeads} disabled={!selectedLeads.size || enrolling}>
                {enrolling ? "Queuing..." : `Queue ${selectedLeads.size} SMS`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Outreach</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">
            Strategic Drip: pick Has website or No website, check leads, one SMS each, spaced 9:00 AM–7:00 PM.
          </p>
        </div>
        <Button className="rounded-xl h-10 bg-copper hover:bg-copper-hover text-white transition-all font-semibold px-5" onClick={() => setMode("create")}>
          <Plus className="h-4 w-4 mr-2" />Create Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-2xl text-muted-foreground bg-card">
          <Zap className="h-10 w-10 mb-3 text-muted-foreground/40" />
          <p className="font-heading font-semibold text-foreground">No campaigns yet</p>
          <p className="text-sm font-sans mt-1">Write a message, filter website / no website, check leads, start drip</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {
            const messages = parseCampaignMessages(c.steps);
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
                        <p className="text-sm font-sans text-muted-foreground line-clamp-2">A: &quot;{messages[0] || "No message"}&quot;{messages[1] ? ` · B: "${messages[1]}"` : ""}</p>
                      </div>
                      <DripPanel campaignId={c.id} status={c.status} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6">
                      {c.status !== "stopped" && (
                        <Button size="sm" variant="outline" className="rounded-xl border-border bg-background" onClick={() => openEnroll(c)}>
                          <Users className="h-4 w-4 mr-2" />Select leads
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
    </div>
  );
}
