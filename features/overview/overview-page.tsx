"use client";
import { useEffect, useState, type ElementType } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import Link from "next/link";
import { Plus, User, Megaphone, TrendingUp, PieChart, Archive, Sparkles, RefreshCw } from "lucide-react";
import { StatusChip } from "@/shared/layout/status-chip";
import { toast } from "@/shared/ui/use-toast";

interface Stats {
  totalLeads: number;
  leadsInterested: number;
  leadsNotInterested?: number;
  queuedLeads: number;
  replyRate: number;
  repliedLeads?: number;
  archivedLeads?: number;
  pendingSuggestions?: number;
}

interface ReplyRow {
  id: string;
  businessName: string | null;
  name: string | null;
  phone: string;
  city: string | null;
  status: string;
  archived: boolean;
  replied: boolean;
  lastInbound: string | null;
  lastOutbound: string | null;
  suggestion: string | null;
  suggestionId: string | null;
}

interface Brief {
  day: string;
  timezone: string;
  generatedAt: string;
  cached: boolean;
  headline: string;
  body: string;
  actions: string[];
  error?: string;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefRefreshing, setBriefRefreshing] = useState(false);

  async function loadBrief(refresh = false) {
    if (refresh) setBriefRefreshing(true);
    else setBriefLoading(true);
    try {
      const res = await fetch(`/api/brief${refresh ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Brief failed");
      setBrief(data);
    } catch (e) {
      setBrief({
        day: "",
        timezone: "",
        generatedAt: "",
        cached: false,
        headline: "Brief unavailable",
        body: e instanceof Error ? e.message : "Could not load operator brief.",
        actions: [],
      });
    } finally {
      setBriefLoading(false);
      setBriefRefreshing(false);
    }
  }

  async function load() {
    const [sRes, rRes] = await Promise.all([fetch("/api/stats"), fetch("/api/replies")]);
    const s = await sRes.json().catch(() => ({}));
    const r = await rRes.json().catch(() => []);
    // #region agent log
    fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
      body: JSON.stringify({
        sessionId: "9903e8",
        runId: "post-fix",
        hypothesisId: "C",
        location: "app/(dashboard)/page.tsx:load",
        message: "dashboard load",
        data: {
          statsOk: sRes.ok,
          statsStatus: sRes.status,
          repliesOk: rRes.ok,
          repliesStatus: rRes.status,
          totalLeads: s && s.totalLeads,
          repliesIsArray: Array.isArray(r),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setStats(s);
    setReplies(Array.isArray(r) ? r : []);
  }

  useEffect(() => {
    load();
    loadBrief();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);

  async function sendSuggestion(row: ReplyRow) {
    if (!row.suggestion) return;
    setSendingId(row.id);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: row.id, message: row.suggestion, suggestionId: row.suggestionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Sent" });
      load();
    } catch (e) {
      toast({ title: "Send failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Agency Pulse</p>
          <h1 className="text-4xl font-heading font-bold text-foreground tracking-tight">Reply dashboard</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2 max-w-xl leading-relaxed">
            Gemini handles not-interested instantly. Interested replies wait for you with a suggested SMS.
          </p>
        </div>
        <Button className="bg-copper hover:bg-copper-hover text-white rounded-xl shadow-sm h-10 px-5" asChild>
          <Link href="/scraper"><Plus className="h-4 w-4 mr-2" />Find Leads</Link>
        </Button>
      </div>

      <Card className="rounded-2xl shadow-sm border-border bg-card">
        <CardHeader className="px-6 py-5 border-b border-border bg-background/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-copper" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">Morning brief</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">
                {brief?.day ? `${brief.day} · ${brief.timezone}` : "Gemini standup for yesterday + today"}
                {brief?.cached ? " · cached until tomorrow" : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg h-8"
              disabled={briefRefreshing}
              onClick={() => loadBrief(true)}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${briefRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-6 py-5 space-y-3">
          {briefLoading ? (
            <p className="text-sm text-muted-foreground">Writing today’s brief…</p>
          ) : (
            <>
              <h2 className="text-xl font-heading font-semibold">{brief?.headline}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{brief?.body}</p>
              {brief?.actions && brief.actions.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {brief.actions.map((a) => (
                    <li key={a} className="text-sm flex gap-2">
                      <span className="text-copper font-mono text-[10px] uppercase tracking-widest mt-1 shrink-0">Next</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard label="Replied" value={String(stats?.repliedLeads ?? "—")} icon={Megaphone} color="bg-peach-soft text-peach-text" />
        <MetricCard label="Interested" value={String(stats?.leadsInterested ?? "—")} icon={TrendingUp} color="bg-mint-soft text-mint-text" />
        <MetricCard label="Not interested" value={String(stats?.leadsNotInterested ?? "—")} icon={User} color="bg-rose-soft text-rose-text" />
        <MetricCard label="Archived" value={String(stats?.archivedLeads ?? "—")} icon={Archive} color="bg-lavender-soft text-lavender-text" />
        <MetricCard label="Needs you" value={String(stats?.pendingSuggestions ?? "—")} icon={PieChart} color="bg-aqua-soft text-aqua-text" />
        <MetricCard label="Reply rate" value={stats ? `${stats.replyRate}%` : "—"} icon={Megaphone} color="bg-beige-soft text-beige-text" />
      </div>

      <Card className="rounded-2xl shadow-sm border-border bg-card">
        <CardHeader className="px-6 py-5 border-b border-border bg-background/50">
          <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">Prospect replies</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {replies.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No prospect replies yet. After they text back, they show up here.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="px-4 py-3">Prospect</th>
                  <th className="px-4 py-3">Replied</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Their message</th>
                  <th className="px-4 py-3">Last sent</th>
                  <th className="px-4 py-3">Archive</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {replies.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.businessName || row.name || row.phone}</p>
                      <p className="text-xs text-muted-foreground">{row.city || row.phone}</p>
                    </td>
                    <td className="px-4 py-3">{row.replied ? "Yes" : "No"}</td>
                    <td className="px-4 py-3"><StatusChip status={row.status} /></td>
                    <td className="px-4 py-3 max-w-[220px] text-muted-foreground">{row.lastInbound || "—"}</td>
                    <td className="px-4 py-3 max-w-[220px] text-muted-foreground">{row.lastOutbound || "—"}</td>
                    <td className="px-4 py-3">{row.archived ? "Archived" : "Open"}</td>
                    <td className="px-4 py-3 text-right space-y-2">
                      {row.suggestion && (
                        <div className="text-left">
                          <p className="text-[10px] font-mono uppercase text-muted-foreground mb-1">Suggested (not sent)</p>
                          <p className="text-xs mb-2">{row.suggestion}</p>
                          <Button size="sm" className="rounded-lg h-8" disabled={sendingId === row.id} onClick={() => sendSuggestion(row)}>
                            {sendingId === row.id ? "Sending..." : "Send this"}
                          </Button>
                        </div>
                      )}
                      <Link href="/inbox" className="block text-xs text-copper mt-1">Inbox</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: ElementType; color: string }) {
  return (
    <Card className="rounded-2xl shadow-sm border-border bg-card">
      <CardContent className="p-5">
        <p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
        <div className="flex items-center justify-between">
          <p className="text-3xl font-heading font-bold">{value}</p>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
