"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, ArrowUpRight, ArrowDownRight, Clock, User, Megaphone, TrendingUp, NotebookPen, PieChart } from "lucide-react";

export default function OverviewPage() {
  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Agency Pulse</p>
          <h1 className="text-4xl font-heading font-bold text-foreground tracking-tight">Your next move is clear.</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2 max-w-xl leading-relaxed">
            Here is what's happening across your plumbing campaigns today. Import leads or run a scraper job to get started.
          </p>
        </div>
        <div>
          <Button className="bg-copper hover:bg-copper-hover text-white rounded-xl shadow-sm h-10 px-5 transition-all" asChild>
            <Link href="/scraper">
              <Plus className="h-4 w-4 mr-2" strokeWidth={2} />
              Find Leads
            </Link>
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MetricCard label="Open Pipeline" value="$0" change="—" up icon={PieChart} color="bg-aqua-soft text-aqua-text" />
        <MetricCard label="Won This Month" value="$0" change="—" up icon={TrendingUp} color="bg-mint-soft text-mint-text" />
        <MetricCard label="New Leads" value="0" change="—" up={false} icon={User} color="bg-lavender-soft text-lavender-text" />
        <MetricCard label="Reply Rate" value="0%" change="—" up icon={Megaphone} color="bg-peach-soft text-peach-text" />
      </div>

      {/* Main Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Lead Activity */}
        <Card className="lg:col-span-2 rounded-2xl shadow-sm border-border bg-card">
          <CardHeader className="px-6 py-5 border-b border-border bg-background/50">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">Lead Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-12 text-center">
              <p className="text-sm font-sans text-muted-foreground">No recent lead activity.</p>
              <Button variant="link" asChild className="text-copper mt-2"><Link href="/scraper">Discover new leads &rarr;</Link></Button>
            </div>
          </CardContent>
        </Card>

        {/* Campaign Pulse */}
        <Card className="rounded-2xl shadow-sm border-border bg-card flex flex-col">
          <CardHeader className="px-6 py-5 border-b border-border bg-background/50">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">Campaign Pulse</CardTitle>
          </CardHeader>
          <CardContent className="p-5 flex-1 flex flex-col items-center justify-center">
             <p className="text-sm font-sans text-muted-foreground">No active campaigns running.</p>
             <Button variant="link" asChild className="text-copper mt-2"><Link href="/campaigns">Create campaign &rarr;</Link></Button>
          </CardContent>
        </Card>

      </div>

      {/* Lower Dashboard Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl shadow-sm border-border bg-card">
          <CardHeader className="px-6 py-5 border-b border-border bg-background/50">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> SMS Campaign Tactics
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              <div className="p-5 hover:bg-muted/30 transition-colors">
                <p className="text-sm font-semibold text-foreground mb-1">Cold Reactivation</p>
                <p className="text-xs font-sans text-muted-foreground mb-2">Target older scraped leads with a low-friction offer.</p>
                <div className="bg-muted/50 p-2 rounded-lg border border-border">
                  <p className="text-xs font-mono text-muted-foreground italic">"Hey {"{name}"}, we help plumbers in {"{city}"} get 20-40 new booked jobs/month. Open to a quick chat?"</p>
                </div>
              </div>
              <div className="p-5 hover:bg-muted/30 transition-colors">
                <p className="text-sm font-semibold text-foreground mb-1">Estimate Follow-Up (Rehash)</p>
                <p className="text-xs font-sans text-muted-foreground mb-2">Automate check-ins on leads sitting in the pipeline.</p>
                <div className="bg-muted/50 p-2 rounded-lg border border-border">
                  <p className="text-xs font-mono text-muted-foreground italic">"Hi {"{name}"}, just checking in on the estimate for {"{businessName}"}. Any questions we can answer?"</p>
                </div>
              </div>
              <div className="p-5 hover:bg-muted/30 transition-colors">
                <p className="text-sm font-semibold text-foreground mb-1">Speed-to-Lead Intro</p>
                <p className="text-xs font-sans text-muted-foreground mb-2">Immediate automated response to new web inquiries.</p>
                <div className="bg-muted/50 p-2 rounded-lg border border-border">
                  <p className="text-xs font-mono text-muted-foreground italic">"Thanks for reaching out! We received your info and will call you in 5 mins. - Sonic CRM"</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm border-border bg-card">
          <CardHeader className="px-6 py-5 border-b border-border bg-background/50">
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
              <NotebookPen className="h-4 w-4" /> Operator Note
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-sm font-sans text-muted-foreground leading-relaxed italic">
              "Your workspace is ready. Begin by importing a CSV of leads, or use the AI Lead Scraper to automatically discover plumbing businesses in your target market."
            </p>
            <p className="text-xs font-mono font-bold mt-4 text-copper">— SYSTEM AI</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, change, up, icon: Icon, color }: { label: string, value: string, change: string, up: boolean, icon: any, color: string }) {
  return (
    <Card className="rounded-2xl shadow-sm border-border bg-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
            <p className="text-3xl font-heading font-bold text-foreground">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs font-semibold">
          <span className={`flex items-center ${up ? 'text-mint-text' : 'text-rose-text'}`}>
            {up ? <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> : <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />}
            {change}
          </span>
          <span className="text-muted-foreground font-normal">vs last month</span>
        </div>
      </CardContent>
    </Card>
  );
}



