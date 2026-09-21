"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { businessLink, formatPhone, leadHasWebsite } from "@/shared/utils";
import { Globe, Search } from "lucide-react";

export type CampaignLeadRow = {
  id: string;
  businessName: string | null;
  name: string | null;
  phone: string;
  city: string | null;
  website: string | null;
  googleMapsUrl?: string | null;
  status: string;
  archived?: boolean;
  campaignLeads?: {
    campaignId: string;
    status: string;
    campaign?: { id: string; name: string; status: string };
  }[];
};

export type WebsiteAudience = "with" | "without" | "any";

interface Props {
  campaignId?: string;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
}

export function leadBlockedReason(lead: CampaignLeadRow, campaignId?: string): string | null {
  if (lead.archived) return "Archived";
  if (lead.status === "not_interested" || lead.status === "closed") return "Do not contact";
  if (!lead.phone) return "No phone";
  const enrollments = lead.campaignLeads || [];
  if (campaignId && enrollments.some((e) => e.campaignId === campaignId)) return "Already in this campaign";
  const active = enrollments.find((e) => e.status === "queued" || e.status === "scheduled");
  if (active) return active.campaign?.name ? `Queued in ${active.campaign.name}` : "Already in a drip";
  return null;
}

export function CampaignLeadPicker({ campaignId, selected, onSelectedChange }: Props) {
  const [leads, setLeads] = useState<CampaignLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [website, setWebsite] = useState<WebsiteAudience>("any");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: "500",
      archived: "false",
      picker: "true",
      website,
      ...(search.trim() ? { search: search.trim() } : {}),
    });
    try {
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      const list: CampaignLeadRow[] = data.data || [];
      setLeads(list);
      setTotal(data.total ?? list.length);
    } catch {
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, website]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const eligibleIds = useMemo(
    () => leads.filter((l) => !leadBlockedReason(l, campaignId)).map((l) => l.id),
    [leads, campaignId],
  );

  function toggle(id: string, blocked: string | null) {
    if (blocked) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  }

  function selectEligible() {
    onSelectedChange(new Set(eligibleIds));
  }

  function clearSelection() {
    onSelectedChange(new Set());
  }

  const audiences: { id: WebsiteAudience; label: string; hint: string }[] = [
    { id: "without", label: "No website", hint: "Same as Finder “no website”" },
    { id: "with", label: "Has website", hint: "Businesses with a real site" },
    { id: "any", label: "All leads", hint: "Ignore website filter" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex rounded-xl bg-card border border-border p-1 shadow-sm w-full sm:w-auto">
        {audiences.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.hint}
            onClick={() => {
              setWebsite(a.id);
              onSelectedChange(new Set());
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              website === a.id ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10 rounded-xl bg-background border-border"
            placeholder="Search company, phone, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl" onClick={selectEligible} disabled={!eligibleIds.length}>
          Select all {eligibleIds.length || ""}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-10 rounded-xl" onClick={clearSelection} disabled={!selected.size}>
          Clear
        </Button>
      </div>

      <p className="text-xs font-sans text-muted-foreground">
        {loading ? "Loading…" : `${total} in this filter`}
        {` · ${eligibleIds.length} can get SMS`}
        {selected.size ? ` · ${selected.size} selected` : ""}
      </p>

      <div className="rounded-2xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b border-border text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id))}
                    onChange={(e) => (e.target.checked ? selectEligible() : clearSelection())}
                    disabled={!eligibleIds.length}
                  />
                </th>
                <th className="px-4 py-3 text-left">Company</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Website</th>
                <th className="px-4 py-3 text-left">SMS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading leads…</td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground font-sans">
                    No leads in this filter. Scrape or import first, or switch Has website / No website.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const blocked = leadBlockedReason(lead, campaignId);
                  const hasSite = leadHasWebsite(lead.website);
                  const link = businessLink({ website: lead.website, googleMapsUrl: lead.googleMapsUrl });
                  const checked = selected.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      className={`border-b border-border/50 ${blocked ? "opacity-60" : "hover:bg-muted/40"} ${checked ? "bg-copper/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={checked}
                          disabled={!!blocked}
                          onChange={() => toggle(lead.id, blocked)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-heading font-semibold text-foreground truncate max-w-[220px]">
                          {lead.businessName || lead.name || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{lead.city || ""}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{formatPhone(lead.phone)}</td>
                      <td className="px-4 py-3">
                        {hasSite && link ? (
                          <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-xs text-copper hover:underline truncate max-w-[160px] inline-block">
                            {link.label}
                          </a>
                        ) : (
                          <span className="text-[10px] font-mono text-muted-foreground">No website</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{blocked || "Ready"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
