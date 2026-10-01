"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Building2,
  Star,
  Layers3,
  ArrowRight,
  RefreshCw,
  Play,
  Database,
  Download,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { toast } from "@/shared/ui/use-toast";
import { businessLink } from "@/shared/utils";

interface ScrapedLead {
  id: string;
  businessName: string;
  category: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  status: string;
  name: string | null;
  notes: string | null;
}

interface SearchJob {
  id: string;
  prompt: string;
  summary: string;
  category: string | null;
  location: string | null;
  requested: number;
  found: number;
  duplicates: number;
  newLeads: number;
  status: string;
  createdAt: string;
}

const STEPS = ["Pick city", "Search Maps", "Filter", "Read reviews", "Owner names", "Save to CRM"];

function formatNextRequest(ms: number): string {
  if (ms <= 50) return "now";
  const seconds = ms / 1000;
  if (seconds < 10) return `in ${seconds.toFixed(1)}s`;
  if (seconds < 60) return `in ${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 10) return `in ${minutes.toFixed(1)}m`;
  return `in ${Math.round(minutes)}m`;
}

export default function NativeScraperPage() {
  const [activeTab, setActiveTab] = useState<"search" | "history">("search");
  const [nextCity, setNextCity] = useState<{ city: string; reason: string; cityCount: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [csvFilename, setCsvFilename] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [results, setResults] = useState<{
    stats: { requested: number; found: number; duplicates: number; newLeads: number; skippedNoPhone?: number };
    leads: ScrapedLead[];
    provider?: string;
  } | null>(null);

  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [finderStatus, setFinderStatus] = useState<{
    target: number;
    validLeads: number;
    remaining: number;
    aiProvider: string;
    nextRequestInMs: number;
    mapsPaidCalls: number;
    mapsCacheHits: number;
    crmDuplicates: number;
    nameRatePct: number;
    nameDetectNamed: number;
    nameDetectWithReviews: number;
    websitePct: number;
    noWebsitePct: number;
    withWebsite: number;
    noWebsite: number;
    leadCap: number | null;
    receivedAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const readRef = useRef<AbortController | null>(null);
  const following = useRef(false);

  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/scraper/jobs");
      const data = await res.json();
      if (res.ok) setJobs(data.jobs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => {
    loadJobs();
    loadNextCity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!searching) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [searching]);

  function applyEvent(event: Record<string, unknown>, replay = false) {
    if (event.type === "step") setStep(Number(event.step) || 0);
    if (event.type === "log") setLogs((prev) => [...prev, String(event.message)]);
    if (event.type === "progress") {
      setProgress({
        current: Number(event.current) || 0,
        total: Number(event.total) || 0,
        message: String(event.message || ""),
      });
    }
    if (event.type === "status") {
      setFinderStatus((prev) => ({
        target: typeof event.target === "number" ? event.target : prev?.target ?? 0,
        validLeads: typeof event.validLeads === "number" ? event.validLeads : prev?.validLeads ?? 0,
        remaining: typeof event.remaining === "number" ? event.remaining : prev?.remaining ?? 0,
        aiProvider: event.aiProvider != null ? String(event.aiProvider) : prev?.aiProvider ?? "waiting",
        nextRequestInMs:
          typeof event.nextRequestInMs === "number" ? event.nextRequestInMs : prev?.nextRequestInMs ?? 0,
        mapsPaidCalls: typeof event.mapsPaidCalls === "number" ? event.mapsPaidCalls : prev?.mapsPaidCalls ?? 0,
        mapsCacheHits: typeof event.mapsCacheHits === "number" ? event.mapsCacheHits : prev?.mapsCacheHits ?? 0,
        crmDuplicates: typeof event.crmDuplicates === "number" ? event.crmDuplicates : prev?.crmDuplicates ?? 0,
        nameRatePct: typeof event.nameRatePct === "number" ? event.nameRatePct : prev?.nameRatePct ?? 0,
        nameDetectNamed: typeof event.nameDetectNamed === "number" ? event.nameDetectNamed : prev?.nameDetectNamed ?? 0,
        nameDetectWithReviews:
          typeof event.nameDetectWithReviews === "number" ? event.nameDetectWithReviews : prev?.nameDetectWithReviews ?? 0,
        websitePct: typeof event.websitePct === "number" ? event.websitePct : prev?.websitePct ?? 0,
        noWebsitePct: typeof event.noWebsitePct === "number" ? event.noWebsitePct : prev?.noWebsitePct ?? 0,
        withWebsite: typeof event.withWebsite === "number" ? event.withWebsite : prev?.withWebsite ?? 0,
        noWebsite: typeof event.noWebsite === "number" ? event.noWebsite : prev?.noWebsite ?? 0,
        leadCap: typeof event.leadCap === "number" ? event.leadCap : event.leadCap === null ? null : prev?.leadCap ?? null,
        receivedAt: Date.now(),
      }));
    }
    if (event.type === "error" && !replay) {
      toast({ title: "Scraper Failed", description: String(event.message), variant: "destructive" });
    }
    if (event.type === "saved") {
      const stats = event.stats as {
        requested: number;
        found: number;
        duplicates: number;
        newLeads: number;
        skippedNoPhone?: number;
      };
      setResults({
        stats,
        leads: (event.leads as ScrapedLead[]) || [],
        provider: String(event.provider || "finder"),
      });
      setCsvFilename(String(event.csvFilename || ""));
      setWarnings((event.warnings as string[]) || []);
      setStep(6);
      if (!replay) {
        toast({
          title: `Discovered ${stats.newLeads} new leads`,
          description: `${stats.duplicates} duplicates skipped. Finder Maps + reviews are now in your CRM.`,
        });
      }
      loadJobs();
      loadNextCity();
    }
  }

  async function readStream(res: Response) {
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Could not start the search.");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const consume = (chunk: string) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) return;
      try {
        applyEvent(JSON.parse(line.slice(6).trim()) as Record<string, unknown>);
      } catch {
        /* Ignore malformed SSE frames. */
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) consume(chunk);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  }

  async function resumeRun(signal: AbortSignal) {
    const res = await fetch("/api/scraper/run", { signal, cache: "no-store" });
    if (!res.ok || signal.aborted || following.current) return;
    const data = (await res.json()) as { running?: boolean; events?: Record<string, unknown>[] };
    const events = Array.isArray(data.events) ? data.events : [];
    if (signal.aborted || following.current) return;
    if (!data.running && events.length === 0) return;
    if (!data.running) {
      for (const event of events) applyEvent(event, true);
      return;
    }
    following.current = true;
    setSearching(true);
    try {
      for (const event of events) applyEvent(event, true);
      if (signal.aborted) return;
      const stream = await fetch(`/api/scraper/run?stream=1&from=${events.length}`, {
        signal,
        cache: "no-store",
      });
      await readStream(stream);
    } finally {
      if (!signal.aborted) {
        following.current = false;
        setSearching(false);
        setProgress(null);
      }
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    readRef.current = ac;
    void resumeRun(ac.signal).catch((err: unknown) => {
      if (ac.signal.aborted) return;
      console.error(err);
    });
    return () => {
      following.current = false;
      ac.abort();
    };
    // Reattach once when this page is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNextCity() {
    try {
      const res = await fetch("/api/scraper/next-city");
      const data = await res.json();
      if (res.ok) {
        setNextCity({
          city: String(data.city || ""),
          reason: String(data.reason || ""),
          cityCount: Number(data.cityCount) || 0,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function runExecute() {
    if (searching) return;
    following.current = true;
    readRef.current?.abort();
    const controller = new AbortController();
    readRef.current = controller;
    setSearching(true);
    setResults(null);
    setLogs([]);
    setWarnings([]);
    setCsvFilename("");
    setProgress(null);
    setFinderStatus(null);
    setStep(1);
    try {
      const res = await fetch("/api/scraper/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      if (res.status === 409) {
        following.current = false;
        await resumeRun(controller.signal);
        return;
      }
      await readStream(res);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      toast({
        title: "Scraper Failed",
        description: err instanceof Error ? err.message : "Search failed",
        variant: "destructive",
      });
    } finally {
      if (!controller.signal.aborted) {
        following.current = false;
        setSearching(false);
        setProgress(null);
      }
    }
  }

  function handleStop() {
    void fetch("/api/scraper/stop", { method: "POST" });
    toast({
      title: "Finder turned off",
      description: "Leads found so far are being saved.",
    });
  }

  function handlePower() {
    if (searching) {
      handleStop();
      return;
    }
    void runExecute();
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Discovery</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">Canvass</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">
            One click. Walks plumber cities in 10-lead batches and starts the next batch by itself. Turn off is the only stop.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-xl bg-card border border-border p-1 shadow-sm">
            <button
              onClick={() => setActiveTab("search")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "search" ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Play className="h-3.5 w-3.5" />
              Canvass
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                loadJobs();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "history" ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers3 className="h-3.5 w-3.5" />
              History ({jobs.length})
            </button>
          </div>

          <Button variant="outline" className="rounded-xl border-border bg-background" asChild>
            <a href="/api/export/all">
              <Download className="h-4 w-4 mr-2 text-copper" />
              Download all leads
            </a>
          </Button>

          <Button variant="outline" className="rounded-xl border-border bg-background" asChild>
            <Link href="/leads">
              <Database className="h-4 w-4 mr-2 text-copper" />
              All CRM Leads
            </Link>
          </Button>
        </div>
      </div>

      {activeTab === "search" ? (
        <div className="space-y-6">
          <Card className="border-border shadow-sm rounded-2xl bg-card">
            <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
                  <Play className="h-4 w-4 text-copper" />
                  Start Canvass
                </CardTitle>
                <Button
                  onClick={handlePower}
                  disabled={!searching && !nextCity}
                  className={
                    searching
                      ? "rounded-xl font-semibold bg-foreground text-background hover:bg-foreground/90"
                      : "rounded-xl font-semibold bg-copper hover:bg-copper-hover text-white"
                  }
                >
                  {searching ? "Turn off" : "Turn on"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm font-sans text-foreground">
                {nextCity
                  ? `Next city: ${nextCity.city}. ${nextCity.reason}${
                      nextCity.cityCount ? ` Walking ${nextCity.cityCount} markets.` : ""
                    }`
                  : "Choosing the next city."}
              </p>
              <p className="text-sm font-sans text-muted-foreground mt-2">
                Each city starts with a deep plumbers search. Drain cleaning and water heater installation run only if that city is still thin. Every 10 new shops save, then the next 10 start on their own. Stays on while you use the rest of the CRM. Turn off is the only thing that stops it.
              </p>
            </CardContent>
          </Card>

          {(searching || logs.length > 0) && (
            <Card className="border-border bg-card rounded-2xl shadow-sm">
              <CardHeader className="border-b border-border bg-background/50 px-6 py-4">
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Live pipeline</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {STEPS.map((label, i) => {
                    const n = i + 1;
                    const active = step === n;
                    const done = step > n;
                    return (
                      <span
                        key={label}
                        className={`text-[11px] font-mono px-3 py-1.5 rounded-full border ${
                          active
                            ? "border-copper/40 bg-copper/10 text-copper"
                            : done
                              ? "border-teal-bright/30 bg-teal-bright/10 text-teal-bright"
                              : "border-border text-muted-foreground"
                        }`}
                      >
                        {n}. {label}
                      </span>
                    );
                  })}
                </div>
                {finderStatus && (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-3">
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {finderStatus.leadCap ? "Lead cap" : "Cities"}
                      </p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">{finderStatus.target}</p>
                    </div>
                    <div className="rounded-xl border border-teal-bright/30 bg-teal-bright/5 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-teal-bright">Valid leads</p>
                      <p className="text-xl font-heading font-bold text-teal-bright mt-1">{finderStatus.validLeads}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {finderStatus.leadCap ? "Leads left" : "Cities left"}
                      </p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">
                        {Math.max(0, finderStatus.remaining)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">AI provider</p>
                      <p className="text-sm font-sans font-semibold text-foreground mt-1 truncate" title={finderStatus.aiProvider}>
                        {finderStatus.aiProvider || "waiting"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-copper/30 bg-copper/5 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-copper">Next request</p>
                      <p className="text-sm font-sans font-semibold text-foreground mt-1">
                        {searching
                          ? formatNextRequest(
                              Math.max(0, finderStatus.nextRequestInMs - (now - finderStatus.receivedAt)),
                            )
                          : "idle"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Apify paid</p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">{finderStatus.mapsPaidCalls}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Apify cache</p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">{finderStatus.mapsCacheHits}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">CRM dups</p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">{finderStatus.crmDuplicates}</p>
                    </div>
                    <div className="rounded-xl border border-copper/30 bg-copper/5 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-copper">Name detect</p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">{finderStatus.nameRatePct}%</p>
                      <p className="text-[10px] font-sans text-muted-foreground mt-1">
                        {finderStatus.nameDetectNamed}/{finderStatus.nameDetectWithReviews} with review text
                      </p>
                    </div>
                    <div className="rounded-xl border border-teal-bright/30 bg-teal-bright/5 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-teal-bright">Has website</p>
                      <p className="text-xl font-heading font-bold text-teal-bright mt-1">{finderStatus.websitePct}%</p>
                      <p className="text-[10px] font-sans text-muted-foreground mt-1">{finderStatus.withWebsite} this session</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">No website</p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">{finderStatus.noWebsitePct}%</p>
                      <p className="text-[10px] font-sans text-muted-foreground mt-1">{finderStatus.noWebsite} this session</p>
                    </div>
                  </div>
                )}
                {progress && (
                  <p className="text-xs font-sans text-muted-foreground">
                    {progress.message} ({progress.current}/{progress.total})
                  </p>
                )}
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl bg-muted/40 p-3 border border-border/50">
                  {logs.map((log, i) => (
                    <p key={`${log}-${i}`} className="text-[11px] font-mono text-muted-foreground">
                      {log}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-copper border-copper/30 bg-copper/5 font-mono text-xs uppercase px-2">
                  Finder Maps + Reviews
                </Badge>
                {csvFilename && (
                  <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs" asChild>
                    <a href={`/api/export?file=${encodeURIComponent(csvFilename)}`}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Last run CSV
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs" asChild>
                  <a href="/api/export/all">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download all leads
                  </a>
                </Button>
              </div>

              {warnings.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-1">
                  {warnings.map((w) => (
                    <p key={w} className="text-xs text-muted-foreground">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="border-border rounded-2xl bg-card shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Discovered</p>
                    <p className="text-3xl font-heading font-bold mt-2 text-foreground">{results.stats.found}</p>
                    <p className="text-[10px] font-sans text-muted-foreground mt-1">Businesses after filters</p>
                  </CardContent>
                </Card>
                <Card className="border-teal-bright/30 bg-teal-bright/5 rounded-2xl shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-teal-bright">New CRM Leads</p>
                    <p className="text-3xl font-heading font-bold mt-2 text-teal-bright">+{results.stats.newLeads}</p>
                    <p className="text-[10px] font-sans text-muted-foreground mt-1">Committed to database</p>
                  </CardContent>
                </Card>
                <Card className="border-border rounded-2xl bg-card shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Duplicates Prevented</p>
                    <p className="text-3xl font-heading font-bold mt-2 text-muted-foreground">{results.stats.duplicates}</p>
                    <p className="text-[10px] font-sans text-muted-foreground mt-1">Already in your CRM</p>
                  </CardContent>
                </Card>
                <Card className="border-copper/30 bg-copper/5 flex items-center justify-center p-4 rounded-2xl shadow-sm">
                  <Button asChild className="w-full h-full rounded-xl bg-copper hover:bg-copper-hover text-white transition-all">
                    <Link href="/leads" className="flex flex-col items-center justify-center gap-1.5 h-full">
                      <span className="flex items-center gap-2 font-semibold">
                        View Database <ArrowRight className="h-4 w-4" />
                      </span>
                      <span className="text-[10px] font-mono opacity-90">Start outreach campaign</span>
                    </Link>
                  </Button>
                </Card>
              </div>

              <Card className="border-border rounded-2xl bg-card shadow-sm overflow-hidden">
                <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
                  <CardTitle className="text-lg font-heading font-semibold text-foreground">New Leads Synced to CRM</CardTitle>
                  <CardDescription className="text-xs font-sans">
                    Owner names and review summaries are stored on each lead, ready for SMS campaigns.
                  </CardDescription>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-background text-left text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                        <th className="py-4 px-6 font-semibold">Business</th>
                        <th className="py-4 px-6 font-semibold">Link</th>
                        <th className="py-4 px-6 font-semibold">Owner</th>
                        <th className="py-4 px-6 font-semibold">Phone</th>
                        <th className="py-4 px-6 font-semibold">Location</th>
                        <th className="py-4 px-6 font-semibold">Reviews</th>
                        <th className="py-4 px-6 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {results.leads.map((lead) => {
                        const link = businessLink({
                          website: lead.website,
                          googleMapsUrl: lead.googleMapsUrl,
                        });
                        return (
                        <tr key={lead.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <Building2 className="h-4 w-4 text-copper shrink-0" />
                              <div>
                                <p className="font-heading font-semibold text-foreground text-sm">{lead.businessName}</p>
                                <p className="text-[11px] font-sans text-muted-foreground line-clamp-2 max-w-xs">
                                  {lead.notes || lead.category}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            {link ? (
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-sans text-copper hover:underline max-w-[180px]"
                                title={link.href}
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{link.label}</span>
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-xs font-sans text-foreground">{lead.name || "—"}</td>
                          <td className="py-4 px-6 font-mono text-xs text-foreground">{lead.phone}</td>
                          <td className="py-4 px-6 text-xs font-sans text-muted-foreground">
                            {lead.city}
                            {lead.state ? `, ${lead.state}` : ""}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                              <Star className="h-3.5 w-3.5 fill-copper text-copper" />
                              <span className="text-[10px] text-muted-foreground">({lead.reviewCount ?? 0})</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <Button size="sm" variant="outline" asChild className="h-8 text-xs rounded-xl border-border bg-background">
                              <Link href="/leads">
                                Profile <ArrowRight className="h-3 w-3 ml-1.5" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <Card className="border-border rounded-2xl bg-card shadow-sm">
          <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading text-lg font-semibold text-foreground">Canvass history</CardTitle>
                <CardDescription className="text-xs font-sans">Past Finder runs saved in this CRM.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={loadJobs} disabled={loadingJobs} className="rounded-xl bg-background">
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loadingJobs ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {jobs.length === 0 ? (
              <div className="p-10 text-center font-sans text-muted-foreground text-sm">
                No Canvass runs yet. Turn it on above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background text-left text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                      <th className="py-4 px-6 font-semibold">Summary</th>
                      <th className="py-4 px-6 font-semibold">Location</th>
                      <th className="py-4 px-6 font-semibold">Kept</th>
                      <th className="py-4 px-6 font-semibold">Discovered</th>
                      <th className="py-4 px-6 font-semibold">New Leads</th>
                      <th className="py-4 px-6 font-semibold">Status</th>
                      <th className="py-4 px-6 font-semibold text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-4 px-6 font-sans font-medium text-foreground">{job.summary}</td>
                        <td className="py-4 px-6 text-xs font-sans text-muted-foreground">{job.location || "Local"}</td>
                        <td className="py-4 px-6 text-xs font-mono text-muted-foreground">{job.requested}</td>
                        <td className="py-4 px-6 text-xs font-mono text-muted-foreground">{job.found}</td>
                        <td className="py-4 px-6 text-xs font-mono font-bold text-teal-bright">+{job.newLeads}</td>
                        <td className="py-4 px-6">
                          <Badge variant="success" className="font-mono text-[10px] uppercase tracking-widest px-2">
                            {job.status}
                          </Badge>
                        </td>
                        <td className="py-4 px-6 text-right text-xs font-mono text-muted-foreground">
                          {new Date(job.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
