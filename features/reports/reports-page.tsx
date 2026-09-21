"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { BarChart3, Trophy } from "lucide-react";

type Row = { campaignId: string; campaignName: string; status: string; variant: number; sent: number; delivered: number; replies: number; interested: number; optOuts: number; replyRate: number; interestedRate: number; optOutRate: number };
type Report = { totals: Omit<Row, "campaignId" | "campaignName" | "status" | "variant" | "replyRate" | "interestedRate" | "optOutRate"> & { replyRate: number; interestedRate: number; optOutRate: number }; winner: Row | null; rows: Row[] };

const empty: Report = { totals: { sent: 0, delivered: 0, replies: 0, interested: 0, optOuts: 0, replyRate: 0, interestedRate: 0, optOutRate: 0 }, winner: null, rows: [] };

export default function ReportsPage() {
  const [report, setReport] = useState<Report>(empty);

  useEffect(() => {
    fetch("/api/reports").then((res) => res.json()).then(setReport).catch(() => setReport(empty));
  }, []);

  const t = report.totals;
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div>
        <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Campaign performance</p>
        <h1 className="text-4xl font-heading font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-2">See which SMS creates the most interested replies.</p>
      </div>

      {report.winner && (
        <Card className="rounded-2xl border-copper/30 bg-copper/5">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-copper/15 text-copper flex items-center justify-center"><Trophy className="h-5 w-5" /></div>
            <div><p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Best performing SMS</p><p className="font-semibold">{report.winner.campaignName} · Version {report.winner.variant === 0 ? "A" : "B"} · {report.winner.interestedRate}% interested reply rate</p></div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[['Delivered', t.delivered], ['Replies', t.replies], ['Interested', t.interested], ['Reply rate', `${t.replyRate}%`], ['Opt-outs', t.optOuts]].map(([label, value]) => (
          <Card key={String(label)} className="rounded-2xl"><CardContent className="p-5"><p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p><p className="text-3xl font-heading font-bold">{value}</p></CardContent></Card>
        ))}
      </div>

      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4" />SMS performance</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="text-left text-[11px] font-mono uppercase tracking-widest text-muted-foreground border-b"><th className="px-5 py-3">Campaign</th><th className="px-5 py-3">Version</th><th className="px-5 py-3">Delivered</th><th className="px-5 py-3">Replies</th><th className="px-5 py-3">Interested</th><th className="px-5 py-3">Rate</th><th className="px-5 py-3">Opt-outs</th></tr></thead><tbody>
            {report.rows.map((row) => <tr key={`${row.campaignId}-${row.variant}`} className="border-b border-border/60"><td className="px-5 py-3 font-medium">{row.campaignName}</td><td className="px-5 py-3"><Badge variant="outline">{row.variant === 0 ? "A" : "B"}</Badge></td><td className="px-5 py-3">{row.delivered}</td><td className="px-5 py-3">{row.replies}</td><td className="px-5 py-3">{row.interested}</td><td className="px-5 py-3 font-semibold text-copper">{row.interestedRate}%</td><td className="px-5 py-3">{row.optOuts}</td></tr>)}
            {!report.rows.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Send a campaign to see results here.</td></tr>}
          </tbody></table>
        </CardContent>
      </Card>
    </div>
  );
}
