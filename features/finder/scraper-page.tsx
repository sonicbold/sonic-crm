"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  Search,
  Building2,
  MapPin,
  Star,
  Globe,
  ShieldCheck,
  Layers3,
  ArrowRight,
  CheckCircle2,
  Zap,
  RefreshCw,
  Play,
  Database,
  Download,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { toast } from "@/shared/ui/use-toast";
import { businessLink } from "@/shared/utils";

interface SearchInterpretation {
  category: string;
  queries: string[];
  locations: string[];
  limit: number;
  filters: {
    minReviews: number | null;
    maxReviews: number | null;
    minRating: number | null;
    maxRating: number | null;
    website: "any" | "missing" | "required";
    phone: "any" | "required";
    businessStatus: "any" | "operational" | "closed";
  };
  segments: number;
  explanation: string;
}

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

const STEPS = ["Understand", "Search Maps", "Filter", "Read reviews", "Summarize", "Save to CRM"];

const PRESETS = [
  "Find 25 plumbers in Houston, TX under 150 reviews, with no website",
  "Find 30 roofers in Dallas, TX under 100 reviews",
  "Find 20 HVAC companies in Phoenix, AZ with a website",
  "Find 15 dentists in Austin, TX under 200 reviews",
];

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
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [parsing, setParsing] = useState(false);
  const [interpretation, setInterpretation] = useState<SearchInterpretation | null>(null);
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
    receivedAt: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function handleParse(customPrompt?: string) {
    const text = customPrompt || prompt;
    if (!text.trim()) return;
    setParsing(true);
    try {
      const res = await fetch("/api/scraper/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInterpretation(data);
    } catch (err: unknown) {
      toast({
        title: "Parse Error",
        description: err instanceof Error ? err.message : "Could not interpret the request",
        variant: "destructive",
      });
    } finally {
      setParsing(false);
    }
  }

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
    handleParse();
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!searching) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [searching]);

  async function handleSearch() {
    if (!prompt.trim() || searching) return;
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
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not start the search.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const applyEvent = (event: Record<string, unknown>) => {
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
            receivedAt: Date.now(),
          }));
        }
        if (event.type === "parsed" && event.parsed && typeof event.parsed === "object") {
          const parsed = event.parsed as {
            businessType: string;
            city: string;
            maxReviews: number | null;
            websitePreference: "with" | "without" | "any";
            targetCount: number;
          };
          setInterpretation({
            category: parsed.businessType,
            queries: [parsed.businessType],
            locations: [parsed.city],
            limit: parsed.targetCount,
            filters: {
              minReviews: null,
              maxReviews: parsed.maxReviews,
              minRating: null,
              maxRating: null,
              website:
                parsed.websitePreference === "without"
                  ? "missing"
                  : parsed.websitePreference === "with"
                    ? "required"
                    : "any",
              phone: "any",
              businessStatus: "operational",
            },
            segments: 1,
            explanation: `Looking for ${parsed.targetCount} ${parsed.businessType} in ${parsed.city}${
              parsed.maxReviews !== null ? `, under ${parsed.maxReviews} reviews` : ""
            }, website: ${parsed.websitePreference}.`,
          });
        }
        if (event.type === "error") {
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
          toast({
            title: `Discovered ${stats.newLeads} new leads`,
            description: `${stats.duplicates} duplicates skipped. Finder Maps + reviews are now in your CRM.`,
          });
          loadJobs();
        }
      };
      const consume = (chunk: string) => {
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) return;
        try {
          const event = JSON.parse(line.slice(6).trim()) as Record<string, unknown>;
          applyEvent(event);
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
    } catch (err: unknown) {
      toast({
        title: "Scraper Failed",
        description: err instanceof Error ? err.message : "Search failed",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
      setProgress(null);
    }
  }

  const websiteLabel =
    interpretation?.filters.website === "missing"
      ? "No Website Only"
      : interpretation?.filters.website === "required"
        ? "Website Required"
        : "Websites Included";

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Discovery</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">AI Lead Scraper</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">
            Finder pipeline: Gemini understands the request, Apify searches Maps, reviews are summarized, then leads sync into this CRM.
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
              <Search className="h-3.5 w-3.5" />
              New Search
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-copper" />
                  Natural Language AI Search
                </CardTitle>
                <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-bright" />
                  Deduplication Active
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="relative">
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleParse();
                  }}
                  placeholder="e.g. Find 25 plumbers in Houston, under 150 reviews, with no website..."
                  className="h-14 pl-5 pr-28 text-sm font-sans bg-background border-border rounded-xl focus-visible:ring-copper shadow-sm"
                />
                <Button
                  onClick={() => handleParse()}
                  disabled={parsing || !prompt.trim()}
                  className="absolute right-2 top-2 h-10 px-5 rounded-lg bg-copper hover:bg-copper-hover text-white font-semibold"
                >
                  {parsing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Interpret
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-medium text-muted-foreground mr-2">Try:</span>
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setPrompt(preset);
                      handleParse(preset);
                    }}
                    className="text-xs font-sans bg-background border border-border px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:border-copper/50 transition-all truncate max-w-xs text-left"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {interpretation && (
            <Card className="border-border bg-card rounded-2xl shadow-sm">
              <CardHeader className="border-b border-border bg-background/50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-teal-bright" />
                    <CardTitle className="font-heading font-semibold text-lg text-foreground">AI Query Interpretation</CardTitle>
                  </div>
                  <Badge variant="outline" className="font-mono text-copper border-copper/30 bg-copper/5 rounded-full px-3 text-xs">
                    {interpretation.limit} Target Leads
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <p className="text-sm font-sans text-foreground bg-muted/40 p-4 rounded-xl border border-border/50">
                  {interpretation.explanation}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-background rounded-xl border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-mono">Category</p>
                    <p className="text-sm font-sans font-semibold mt-2 flex items-center gap-2 truncate text-foreground">
                      <Building2 className="h-4 w-4 text-copper shrink-0" />
                      {interpretation.category}
                    </p>
                  </div>
                  <div className="p-4 bg-background rounded-xl border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-mono">Location</p>
                    <p className="text-sm font-sans font-semibold mt-2 flex items-center gap-2 truncate text-foreground">
                      <MapPin className="h-4 w-4 text-copper shrink-0" />
                      {interpretation.locations[0]}
                    </p>
                  </div>
                  <div className="p-4 bg-background rounded-xl border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-mono">Review Cap</p>
                    <p className="text-sm font-sans font-semibold mt-2 flex items-center gap-2 text-foreground">
                      <Star className="h-4 w-4 text-copper shrink-0" />
                      {interpretation.filters.maxReviews ? `Under ${interpretation.filters.maxReviews}` : "Any count"}
                    </p>
                  </div>
                  <div className="p-4 bg-background rounded-xl border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-mono">Website</p>
                    <p className="text-sm font-sans font-semibold mt-2 flex items-center gap-2 truncate text-foreground">
                      <Globe className="h-4 w-4 text-copper shrink-0" />
                      {websiteLabel}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="lg"
                    onClick={handleSearch}
                    disabled={searching}
                    className="w-full sm:w-auto px-8 rounded-xl font-semibold shadow-sm bg-copper hover:bg-copper-hover text-white transition-all h-12"
                  >
                    {searching ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Running Finder pipeline...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2 fill-current" />
                        Execute AI Search ({interpretation.limit} Leads)
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Target</p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">{finderStatus.target}</p>
                    </div>
                    <div className="rounded-xl border border-teal-bright/30 bg-teal-bright/5 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-teal-bright">Valid leads</p>
                      <p className="text-xl font-heading font-bold text-teal-bright mt-1">{finderStatus.validLeads}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Remaining</p>
                      <p className="text-xl font-heading font-bold text-foreground mt-1">
                        {Math.max(
                          0,
                          finderStatus.remaining || finderStatus.target - finderStatus.validLeads,
                        )}
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
                <CardTitle className="font-heading text-lg font-semibold text-foreground">Search History</CardTitle>
                <CardDescription className="text-xs font-sans">Past Finder scraper jobs saved in this CRM.</CardDescription>
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
                No past searches yet. Run your first discovery job above!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background text-left text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                      <th className="py-4 px-6 font-semibold">Summary</th>
                      <th className="py-4 px-6 font-semibold">Location</th>
                      <th className="py-4 px-6 font-semibold">Requested</th>
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
