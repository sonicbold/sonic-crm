"use client";
import React, { useState } from "react";
import { LeadsTable } from "@/components/leads-table";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, Upload } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export default function LeadsPage() {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ name: "", phone: "", businessName: "", city: "", email: "" });
  const [saving, setSaving] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      
      // Proper CSV parser that handles quoted values (e.g. "FlowBoost, Inc.")
      function parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuotes = !inQuotes; }
          else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
          else { current += ch; }
        }
        result.push(current.trim());
        return result;
      }
      
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const leads = lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj: any = {};
        headers.forEach((h, i) => obj[h] = values[i]?.trim());
        return obj;
      });
      const res = await fetch("/api/leads/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `Imported ${data.imported} leads!` });
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addLead() {
    if (!form.phone) return;
    setSaving(true);
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast({ title: "Error", description: data.error || "Failed", variant: "destructive" }); return; }
    toast({ title: "Lead added!" });
    setAddOpen(false); setForm({ name: "", phone: "", businessName: "", city: "", email: "" });
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold text-copper uppercase tracking-[0.15em] mb-2">Database</p>
          <h1 className="text-4xl font-heading font-bold tracking-tight">Leads</h1>
          <p className="text-sm font-sans text-muted-foreground mt-2">Unified database of all scraped, imported, and manual leads</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="rounded-xl h-10 border-border text-foreground hover:bg-muted font-semibold transition-colors" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Add Lead
          </Button>
          <input type="file" accept=".csv" className="hidden" ref={fileRef} onChange={handleFileUpload} />
          <Button size="sm" className="rounded-xl h-10 bg-copper hover:bg-copper-hover text-white transition-all font-semibold" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-2" />{importing ? "Importing..." : "Import CSV"}
          </Button>
        </div>
      </div>

      <LeadsTable key={refreshKey} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Add Lead Manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Business Name</Label><Input className="bg-background border-border rounded-xl h-10" placeholder="Mike Plumbing Co." value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Contact Name</Label><Input className="bg-background border-border rounded-xl h-10" placeholder="Mike Johnson" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Phone <span className="text-destructive">*</span></Label><Input className="bg-background border-border rounded-xl h-10" placeholder="+1 555 000 0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">City</Label><Input className="bg-background border-border rounded-xl h-10" placeholder="Houston, TX" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground">Email</Label><Input type="email" className="bg-background border-border rounded-xl h-10" placeholder="mike@mikeplumbing.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl border-border" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="rounded-xl bg-copper hover:bg-copper-hover text-white" onClick={addLead} disabled={!form.phone || saving}>{saving ? "Adding..." : "Add Lead"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

