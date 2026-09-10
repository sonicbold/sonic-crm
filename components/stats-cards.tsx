"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Send, MessageSquare, TrendingUp, Package, ThumbsUp } from "lucide-react";

interface Stats { queuedLeads: number;
  totalLeads: number; leadsContacted: number; leadsInterested: number;
  messagesSent: number; messagesDelivered: number; inboundReplies: number;
  positiveReplies: number; negativeReplies: number;
  replyRate: number; deliveryRate: number; interestRate: number;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: number | string; sub?: string; color: string }) {
  return (
    <Card className="animate-fade-in rounded-2xl shadow-sm border-border bg-card hover:shadow-md transition-all">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider font-mono">{label}</p>
            <p className="text-3xl font-heading font-bold mt-1 text-foreground">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-1 font-sans font-medium">{sub}</p>}
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  if (!stats) return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="rounded-2xl border-border"><CardContent className="p-5"><div className="h-14 animate-pulse bg-muted rounded-lg" /></CardContent></Card>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatCard icon={Users}         label="Total Leads"   value={stats.totalLeads}      sub={`${stats.leadsContacted} contacted`}   color="bg-blue-50 text-blue-600" />
      <StatCard icon={TrendingUp}    label="Interested"    value={stats.leadsInterested}  sub={`${stats.interestRate}% of replies`}  color="bg-mint-soft text-mint-text" />
      <StatCard icon={Send}          label="SMS Sent"       value={stats.messagesSent}     sub={`${stats.deliveryRate}% delivered`}   color="bg-purple-50 text-purple-600" />
      <StatCard icon={MessageSquare} label="Replies"        value={stats.inboundReplies}   sub={`${stats.replyRate}% reply rate`}     color="bg-amber-50 text-amber-600" />
      <StatCard icon={ThumbsUp}      label="Positive"       value={stats.positiveReplies}  sub="AI-classified"                        color="bg-emerald-50 text-emerald-600" />
      <StatCard icon={Package}       label="In Queue"       value={stats.queuedLeads}      sub="Currently drip feeding"               color="bg-sky-50 text-sky-600" />
    </div>
  );
}

