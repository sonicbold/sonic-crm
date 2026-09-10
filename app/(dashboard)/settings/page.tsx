import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Key, Bot, Phone, Shield } from "lucide-react";

function StatusRow({ label, description, connected }: { label: string; description: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {connected ? (
        <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-3 w-3" /> Connected
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50">
          <XCircle className="h-3 w-3" /> Not configured
        </Badge>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const envStatus = {
    twilio: !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_PHONE_NUMBER,
    openai: !!process.env.OPENAI_API_KEY,
    outscraper: !!process.env.OUTSCRAPER_API_KEY,
    cron: !!process.env.CRON_SECRET,
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Configuration</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">Manage your CRM integrations and AI agent configuration</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
            <div className="flex items-center gap-3">
              <Key className="h-4 w-4 text-copper" />
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">API Integrations</CardTitle>
            </div>
            <CardDescription className="text-xs font-sans text-muted-foreground mt-1">Status of your environment variables</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0 p-0 px-6">
            <StatusRow
              label="Outscraper (Google Maps)"
              description="Real-time business discovery with default deduplication"
              connected={envStatus.outscraper}
            />
            <StatusRow
              label="Twilio SMS"
              description="Account SID, Auth Token, and Phone Number"
              connected={envStatus.twilio}
            />
            <StatusRow
              label="OpenAI (AI Agent)"
              description="API key for sentiment analysis and auto-replies"
              connected={envStatus.openai}
            />
            <StatusRow
              label="Cron Secret"
              description="Protection key for the drip campaign scheduler"
              connected={envStatus.cron}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
            <div className="flex items-center gap-3">
              <Bot className="h-4 w-4 text-teal-bright" />
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">AI Agent</CardTitle>
            </div>
            <CardDescription className="text-xs font-sans text-muted-foreground mt-1">Auto-reply and sentiment analysis powered by OpenAI</CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-sans font-medium text-foreground">Model</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">Currently using {process.env.OPENAI_MODEL || "gpt-4o"}</p>
              </div>
              <Badge variant={envStatus.openai ? "success" : "muted" as any} className="uppercase font-mono text-[10px] tracking-widest">
                {envStatus.openai ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
