"use client";
import { useState, useEffect, useCallback } from "react";
import { CampaignBuilder } from "@/components/campaign-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Play, Pause, Trash2, Users, Zap } from "lucide-react";
import { parseCampaignSteps, timeAgo } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

interface Campaign {
  id: string; name: string; description: string | null; status: string;
  steps: string; createdAt: string;
  _count: { campaignLeads: number; messages: number };
}

const statusColors: Record<string, "success" | "info" | "warning" | "muted"> = {
  active: "success", draft: "muted", paused: "warning", completed: "info",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<{ id: string; businessName: string | null; name: string | null; phone: string; status: string }[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [isDrip, setIsDrip] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    setCampaigns(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleStatus(c: Campaign) {
    const newStatus = c.status === "active" ? "paused" : "active";
    await fetch("/api/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, status: newStatus }) });
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
    setLeads(data.data || []);
    setSelectedLeads(new Set());
  }

  async function enrollLeads() {
    if (!enrollOpen || !selectedLeads.size) return;
    setEnrolling(true);
    const res = await fetch("/api/campaigns/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: enrollOpen.id, leadIds: Array.from(selectedLeads), isDrip }),
    });
    const data = await res.json();
    setEnrolling(false); setEnrollOpen(null);
    toast({ title: `Enrolled ${data.enrolled} leads`, description: data.dripped ? "Messages queued securely (9 AM - 5 PM)." : `${data.sent} messages sent instantly.` });
    load();
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Automations</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">Manage your SMS drip campaigns and monitor reply rates.</p>
        </div>
        <Button className="rounded-xl h-10 bg-copper hover:bg-copper-hover text-white transition-all font-semibold px-5" onClick={() => setBuilderOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Create Campaign
        </Button>
      </div>

      <div className="bg-aqua-soft/50 rounded-xl p-4 border border-aqua-border">
        <p className="text-sm text-aqua-text font-medium flex items-start gap-2">
          <Zap className="h-4 w-4 shrink-0 mt-0.5" />
          <span><strong className="font-bold">Demo Mode:</strong> No carrier is connected. Activating campaigns lets you model the workflow without sending a single message.</span>
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-2xl text-muted-foreground bg-card">
          <Zap className="h-10 w-10 mb-3 text-muted-foreground/40" />
          <p className="font-heading font-semibold text-foreground">No campaigns yet</p>
          <p className="text-sm font-sans mt-1">Create your first plumbing outreach campaign</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(c => {
            const steps = parseCampaignSteps(c.steps);
            const statusColor = statusColors[c.status] || "muted";
            // Mock data for UI display
            const replies = Math.floor(c._count.messages * 0.15);
            const rate = c._count.messages > 0 ? Math.round((replies / c._count.messages) * 100) : 0;
            const rev = replies * 1200; // Mock

            return (
              <Card key={c.id} className="rounded-2xl shadow-sm border-border bg-card hover:border-copper/40 transition-colors">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-heading font-semibold text-lg text-foreground truncate">{c.name}</h3>
                        <Badge variant={statusColor as any} className="uppercase tracking-widest text-[10px]">{c.status}</Badge>
                      </div>
                      <div className="p-3 bg-muted/40 rounded-xl border border-border/50 max-w-2xl mb-4">
                        <p className="text-sm font-sans text-muted-foreground line-clamp-2">"{steps[0]?.message || 'No messages'}"</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-6 text-[11px] font-mono text-muted-foreground">
                        <span><strong className="text-foreground">{c._count.campaignLeads}</strong> leads</span>
                        <span><strong className="text-foreground">{c._count.messages}</strong> sent</span>
                        <span><strong className="text-foreground">{replies}</strong> replies</span>
                        <span><strong className="text-foreground">{rate}%</strong> rate</span>
                        <span><strong className="text-copper">${rev.toLocaleString()}</strong> rev</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6">
                      <Button size="sm" variant="outline" className="rounded-xl border-border bg-background" onClick={() => openEnroll(c)}><Users className="h-4 w-4 mr-2" />Enroll</Button>
                      <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl border-border bg-background" onClick={() => toggleStatus(c)}>
                        {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-rose-text hover:bg-rose-soft transition-colors" onClick={() => deleteCampaign(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CampaignBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} onSave={load} />

      {/* Enroll modal */}
      <Dialog open={!!enrollOpen} onOpenChange={() => setEnrollOpen(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] rounded-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Enroll Leads</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 overflow-y-auto max-h-96">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-sans text-muted-foreground">Select leads to enroll</p>
              <Button variant="ghost" size="sm" className="h-8 rounded-xl" onClick={() => setSelectedLeads(new Set(leads.map(l => l.id)))}>Select all</Button>
            </div>
            {leads.map(lead => (
              <div key={lead.id} className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-colors ${selectedLeads.has(lead.id) ? "border-copper bg-copper/5" : "border-border bg-background hover:bg-muted/30"}`}
                onClick={() => setSelectedLeads(prev => { const n = new Set(prev); n.has(lead.id) ? n.delete(lead.id) : n.add(lead.id); return n; })}>
                <input type="checkbox" className="rounded border-border" checked={selectedLeads.has(lead.id)} onChange={() => {}} />
                <div>
                  <p className="text-sm font-sans font-medium text-foreground">{lead.businessName || lead.name || lead.phone}</p>
                  <p className="text-[11px] font-mono tracking-tight text-muted-foreground mt-0.5">{lead.phone}</p>
                </div>
              </div>
            ))}
            <div className="mt-4 pt-4 border-t border-border">
              <label className="text-sm font-heading font-semibold">Human-Like Throttling</label>
              <p className="text-xs font-sans text-muted-foreground mb-3 mt-1">Enforces a strict 9 AM - 7 PM sending window. Randomizes gap between every single message.</p>
              <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-xl border border-border">
                <input type="checkbox" checked={isDrip} onChange={e => setIsDrip(e.target.checked)} className="h-4 w-4 rounded border-border" />
                <span className="text-sm font-sans font-medium text-foreground">Enable randomized 18–42 minute delay</span>
              </div>
            </div>
            {leads.length === 0 && <p className="text-center text-muted-foreground text-sm font-sans py-8">No entirely fresh leads available. Leads already contacted are hidden.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl border-border" onClick={() => setEnrollOpen(null)}>Cancel</Button>
            <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={enrollLeads} disabled={!selectedLeads.size || enrolling}>
              {enrolling ? "Enrolling..." : `Enroll ${selectedLeads.size} Lead${selectedLeads.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}






