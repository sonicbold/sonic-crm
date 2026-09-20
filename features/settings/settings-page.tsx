"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Key, Bot, CheckCircle2, XCircle, Copy } from "lucide-react";
import { toast } from "@/shared/ui/use-toast";

const FIELDS: { key: string; label: string; hint: string; placeholder: string }[] = [
  { key: "GEMINI_API_KEY", label: "Google Gemini API key", hint: "AI Studio key. Used to classify replies and draft SMS.", placeholder: "AIza..." },
  { key: "TELNYX_API_KEY", label: "Telnyx API key", hint: "Sends and receives SMS.", placeholder: "KEY..." },
  { key: "TELNYX_PHONE_NUMBER", label: "Telnyx from-number", hint: "E.164, e.g. +1...", placeholder: "+1..." },
  { key: "TELNYX_PUBLIC_KEY", label: "Telnyx public key (optional)", hint: "Webhook signature verification.", placeholder: "base64..." },
  { key: "TELNYX_MESSAGING_PROFILE_ID", label: "Telnyx messaging profile (optional)", hint: "If your number is on a profile.", placeholder: "uuid" },
  { key: "APIFY_API_TOKEN", label: "Apify API token", hint: "Finder Maps + reviews scraper.", placeholder: "apify_api_..." },
  { key: "GROQ_API_KEY_1", label: "Groq API key 1", hint: "Review summaries and owner names.", placeholder: "gsk_..." },
  { key: "GROQ_API_KEY_2", label: "Groq API key 2 (optional)", hint: "Fallback Groq account.", placeholder: "gsk_..." },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter API key (optional)", hint: "Fallback if Groq is busy.", placeholder: "sk-or-..." },
  { key: "NOTIFY_PHONE", label: "Notify my phone (optional)", hint: "Get a text when someone is interested.", placeholder: "+1..." },
  { key: "CRM_TIMEZONE", label: "Timezone", hint: "Strategic Drip window 9 AM–7 PM.", placeholder: "America/New_York" },
];

export default function SettingsPage() {
  const [status, setStatus] = useState({
    gemini: false,
    telnyx: false,
    apify: false,
    groq: false,
    openrouter: false,
    finder: false,
    notify: false,
    ready: false,
    agentApi: false,
  });
  const [masked, setMasked] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [agentMasked, setAgentMasked] = useState("");
  const [freshKey, setFreshKey] = useState("");
  const [rotating, setRotating] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setStatus({ agentApi: false, ...data.status });
    const masks: Record<string, string> = {};
    for (const key of Object.keys(data.fields || {})) {
      masks[key] = data.fields[key].masked || "";
    }
    setMasked(masks);
    setForm({ CRM_TIMEZONE: data.timezone || "America/New_York" });
    const keyRes = await fetch("/api/settings/api-key");
    const keyData = await keyRes.json();
    setAgentMasked(keyData.masked || "");
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast({ title: "Saved", description: data.message });
      await load();
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function rotateKey() {
    if (agentMasked && !confirm("This replaces the current agent key. Old keys stop working immediately.")) return;
    setRotating(true);
    try {
      const res = await fetch("/api/settings/api-key", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate key");
      setFreshKey(data.key);
      toast({ title: "API key created", description: "Copy it now. It will not be shown in full again." });
      await load();
    } catch (e) {
      toast({ title: "Could not generate key", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setRotating(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Configuration</p>
        <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm font-sans text-muted-foreground mt-2">
          Paste keys here. They are stored in the CRM database and take effect immediately — no restart.
        </p>
      </div>

      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
          <div className="flex items-center gap-3">
            <Bot className="h-4 w-4 text-teal-bright" />
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">Live status</CardTitle>
          </div>
          <CardDescription className="text-xs mt-1">Gemini classifies replies. Finder uses Gemini + Apify + Groq. Telnyx sends SMS.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4 space-y-2">
          {[
            ["Google Gemini", status.gemini],
            ["Telnyx SMS", status.telnyx],
            ["Finder / Apify", status.apify],
            ["Groq summaries", status.groq],
            ["OpenRouter fallback", status.openrouter],
            ["Owner notify SMS", status.notify],
            ["Agent API key", status.agentApi],
          ].map(([label, ok]) => (
            <div key={String(label)} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm">{label}</span>
              {ok ? (
                <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50"><XCircle className="h-3 w-3" /> Missing</Badge>
              )}
            </div>
          ))}
          <p className={`text-sm pt-2 ${status.ready ? "text-mint-text" : "text-muted-foreground"}`}>
            {status.ready ? "System is live. Inbound prospect replies are handled automatically." : "Add Gemini + Telnyx key + from-number to go live."}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
          <div className="flex items-center gap-3">
            <Key className="h-4 w-4 text-copper" />
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">Agent API key</CardTitle>
          </div>
          <CardDescription className="text-xs mt-1">
            Give this key to your AI agent. It can list leads, send SMS, run drip, scrape, and read inbox via /api/v1.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Current key: <span className="font-mono">{agentMasked || "not generated"}</span>
          </p>
          {freshKey && (
            <div className="rounded-xl border border-copper/40 bg-copper/5 p-3 space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-copper">Copy now — shown once</p>
              <p className="text-xs font-mono break-all">{freshKey}</p>
              <Button size="sm" className="rounded-lg h-8" onClick={() => copy(freshKey)}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy key
              </Button>
            </div>
          )}
          <pre className="text-[11px] bg-muted/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{`Authorization: Bearer YOUR_KEY
GET  http://localhost:3000/api/v1
GET  http://localhost:3000/api/v1/stats
GET  http://localhost:3000/api/v1/leads
POST http://localhost:3000/api/v1/sms`}</pre>
          <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={rotateKey} disabled={rotating}>
            {rotating ? "Generating..." : agentMasked ? "Rotate key" : "Generate agent API key"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border bg-background/50 px-6 py-5">
          <div className="flex items-center gap-3">
            <Key className="h-4 w-4 text-copper" />
            <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground font-semibold">API keys</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-6 py-5 space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</Label>
              <Input
                type={f.key.includes("KEY") ? "password" : "text"}
                autoComplete="off"
                placeholder={masked[f.key] ? `Saved: ${masked[f.key]}` : f.placeholder}
                value={form[f.key] || ""}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-10 rounded-xl"
              />
              <p className="text-[11px] text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save keys and go live"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
