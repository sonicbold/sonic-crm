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
  Phone,
  ShieldCheck,
  Layers3,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Zap,
  RefreshCw,
  Play,
  Send,
  Database,
  Users,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";

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

export default function NativeScraperPage() {
  const [activeTab, setActiveTab] = useState<"search" | "history">("search");
  const [prompt, setPrompt] = useState("Find 25 plumbers in Houston, TX with at least 4.0 stars");
  const [outscraperApiKey, setOutscraperApiKey] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [interpretation, setInterpretation] = useState<SearchInterpretation | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{
    stats: { requested: number; found: number; duplicates: number; newLeads: number };
    leads: ScrapedLead[];
    provider?: string;
  } | null>(null);

  const [jobs, setJobs] = useState<SearchJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [totalScraped, setTotalScraped] = useState(0);

  // Quick preset pills (defaulting to normal businesses, not forcing 'no website')
  const presets = [
    "Find 25 plumbers in Houston, TX with at least 4.0 stars",
    "Find 30 roofers in Dallas, TX under 100 reviews",
    "Find 20 HVAC companies in Phoenix, AZ with 4+ stars",
    "Find 15 dentists in Austin, TX with phone",
  ];

  // Parse prompt automatically or on button click
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
    } catch (err: any) {
      toast({ title: "Parse Error", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  // Load jobs history
  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/scraper/jobs");
      const data = await res.json();
      if (res.ok) {
        setJobs(data.jobs || []);
        setTotalScraped(data.totalScraped || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => {
    handleParse();
    loadJobs();
  }, []);

  // Execute Search & Commit straight to Sonic CRM Lead Database
  async function handleSearch() {
    if (!interpretation) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await fetch("/api/scraper/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          interpretation,
          outscraperApiKey: outscraperApiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResults({
        stats: data.stats,
        leads: data.leads || [],
        provider: data.provider,
      });

      toast({
        title: `Discovered ${data.stats.newLeads} new leads!`,
        description: `Added directly to your unified Sonic CRM database (${data.stats.duplicates} duplicates protected via Outscraper & CRM deduplication).`,
      });

      loadJobs();
    } catch (err: any) {
      toast({ title: "Scraper Failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Discovery</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">AI Lead Scraper</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">
            Extract qualified plumbing leads with Outscraper and automatically sync to your Sonic CRM database.
          </p>
        </div>

        <div className="flex items-center gap-3">
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
              onClick={() => { setActiveTab("history"); loadJobs(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "history" ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers3 className="h-3.5 w-3.5" />
              History ({jobs.length})
            </button>
          </div>

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
          {/* Natural Language Search Prompt */}
          <Card className="border-border shadow-sm rounded-2xl bg-card">
            <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-copper" />
                  Natural Language AI Search
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-teal-bright" />
                    Deduplication Active
                  </span>
                  <button
                    onClick={() => setShowConfig(!showConfig)}
                    className="text-xs font-sans font-medium text-copper hover:underline ml-3"
                  >
                    {showConfig ? "Hide Config" : "API Config"}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {showConfig && (
                <div className="p-4 bg-background border border-border rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-sans font-semibold text-foreground text-sm flex items-center gap-2">
                      <Globe className="h-4 w-4 text-copper" />
                      Outscraper API Key
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Optional: Uses .env otherwise
                    </span>
                  </div>
                  <Input
                    type="password"
                    placeholder="Enter your Outscraper API key..."
                    value={outscraperApiKey}
                    onChange={(e) => setOutscraperApiKey(e.target.value)}
                    className="h-10 text-sm bg-card border-border rounded-xl focus-visible:ring-copper"
                  />
                  <div className="flex items-center gap-4 pt-1 text-xs font-sans text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-teal-bright">
                      <Check className="h-3.5 w-3.5" /> dropDuplicates=true enabled
                    </span>
                  </div>
                </div>
              )}

              <div className="relative">
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleParse();
                  }}
                  placeholder="e.g. Find 25 plumbers in Houston with at least 4.0 stars..."
                  className="h-14 pl-5 pr-28 text-sm font-sans bg-background border-border rounded-xl focus-visible:ring-copper shadow-sm"
                />
                <Button
                  onClick={() => handleParse()}
                  disabled={parsing || !prompt.trim()}
                  className="absolute right-2 top-2 h-10 px-5 rounded-lg bg-copper hover:bg-copper-hover text-white font-semibold"
                >
                  {parsing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <SlidersHorizontal className="h-4 w-4 mr-2" />}
                  Interpret
                </Button>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-medium text-muted-foreground mr-2">Try:</span>
                {presets.map((preset, idx) => (
                  <button
                    key={idx}
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

          {/* Live Interpretation Card */}
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
                      {interpretation.locations[0] || "Houston, TX"}
                    </p>
                  </div>

                  <div className="p-4 bg-background rounded-xl border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-mono">Rating Filter</p>
                    <p className="text-sm font-sans font-semibold mt-2 flex items-center gap-2 text-foreground">
                      <Star className="h-4 w-4 text-copper shrink-0" />
                      {interpretation.filters.minRating ? `>= ${interpretation.filters.minRating} Stars` : "Any Rating"}
                    </p>
                  </div>

                  <div className="p-4 bg-background rounded-xl border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider font-mono">Website</p>
                    <p className="text-sm font-sans font-semibold mt-2 flex items-center gap-2 truncate text-foreground">
                      <Globe className="h-4 w-4 text-copper shrink-0" />
                      {interpretation.filters.website === "missing" 
                        ? "No Website Only" 
                        : interpretation.filters.website === "required"
                        ? "Website Required"
                        : "Websites Included"}
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
                        Scraping & Adding to Sonic CRM...
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

          {/* Search Results Display */}
          {results && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-copper border-copper/30 bg-copper/5 font-mono text-xs uppercase px-2">
                  {results.provider === "outscraper" ? "Outscraper Data" : "Local Discovery"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="border-border rounded-2xl bg-card shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Discovered</p>
                    <p className="text-3xl font-heading font-bold mt-2 text-foreground">{results.stats.found}</p>
                    <p className="text-[10px] font-sans text-muted-foreground mt-1">Total matching businesses</p>
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

              {/* Live Leads Table */}
              <Card className="border-border rounded-2xl bg-card shadow-sm overflow-hidden">
                <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
                  <CardTitle className="text-lg font-heading font-semibold text-foreground">New Leads Synced to Sonic CRM</CardTitle>
                  <CardDescription className="text-xs font-sans">
                    These leads are now saved in your CRM database and ready for SMS drips.
                  </CardDescription>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-background text-left text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                        <th className="py-4 px-6 font-semibold">Business</th>
                        <th className="py-4 px-6 font-semibold">Phone</th>
                        <th className="py-4 px-6 font-semibold">Location</th>
                        <th className="py-4 px-6 font-semibold">Rating</th>
                        <th className="py-4 px-6 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {results.leads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <Building2 className="h-4 w-4 text-copper shrink-0" />
                              <div>
                                <p className="font-heading font-semibold text-foreground text-sm">{lead.businessName}</p>
                                <p className="text-[11px] font-sans text-muted-foreground">{lead.category}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 font-mono text-xs text-foreground">
                            {lead.phone}
                          </td>
                          <td className="py-4 px-6 text-xs font-sans text-muted-foreground">
                            {lead.city}, {lead.state}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                              <Star className="h-3.5 w-3.5 fill-copper text-copper" />
                              <span className="font-bold text-foreground">{lead.rating}</span>
                              <span className="text-[10px] text-muted-foreground">({lead.reviewCount})</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <Button size="sm" variant="outline" asChild className="h-8 text-xs rounded-xl border-border bg-background">
                              <Link href={`/leads`}>
                                Profile <ArrowRight className="h-3 w-3 ml-1.5" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : (
        /* Search Jobs History Tab */
        <Card className="border-border rounded-2xl bg-card shadow-sm">
          <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading text-lg font-semibold text-foreground">Search History</CardTitle>
                <CardDescription className="text-xs font-sans">
                  All past AI scraper jobs executed in Sonic CRM.
                </CardDescription>
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
                        <td className="py-4 px-6 font-sans font-medium text-foreground">
                          {job.summary}
                        </td>
                        <td className="py-4 px-6 text-xs font-sans text-muted-foreground">
                          {job.location || "Local"}
                        </td>
                        <td className="py-4 px-6 text-xs font-mono text-muted-foreground">{job.requested}</td>
                        <td className="py-4 px-6 text-xs font-mono text-muted-foreground">{job.found}</td>
                        <td className="py-4 px-6 text-xs font-mono font-bold text-teal-bright">
                          +{job.newLeads}
                        </td>
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
