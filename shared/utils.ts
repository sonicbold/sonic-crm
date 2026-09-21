import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  if (cleaned.length === 11 && cleaned[0] === "1") return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
  return phone;
}

export function ensureE164(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned[0] === "1") return `+${cleaned}`;
  if (cleaned.length > 6) return `+${cleaned}`;
  return phone;
}

export function phoneLookupValues(phone: string): string[] {
  const e164 = ensureE164(phone);
  const digits = phone.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return [...new Set([phone, e164, digits, last10, `+1${last10}`, `1${last10}`].filter(Boolean))];
}

export function interpolateMessage(
  template: string,
  lead: { name?: string | null; businessName?: string | null; city?: string | null }
): string {
  return template
    .replace(/\{\{name\}\}|\{name\}/g, lead.name || "there")
    .replace(/\{\{business\}\}|\{businessName\}|\{business\}/g, lead.businessName || "your business")
    .replace(/\{\{city\}\}|\{city\}/g, lead.city || "your area");
}

export function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function toHttpUrl(value: string | null | undefined): string | null {
  const v = (value || "").trim();
  if (!v || /^no link$/i.test(v)) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  return `https://${v}`;
}

export function leadHasWebsite(website?: string | null): boolean {
  return Boolean(toHttpUrl(website));
}

/** Prisma where-clause matching Finder: real site vs missing / "No link". */
export function websitePrismaWhere(filter: string | null | undefined): Record<string, unknown> {
  if (filter !== "with" && filter !== "without") return {};
  const missing = {
    OR: [
      { website: null },
      { website: "" },
      { website: "No link" },
      { website: "no link" },
      { website: "No Link" },
    ],
  };
  return filter === "without" ? missing : { NOT: missing };
}

export function businessLink(opts: {
  website?: string | null;
  googleMapsUrl?: string | null;
}): { href: string; label: string; kind: "website" | "maps" } | null {
  const site = toHttpUrl(opts.website);
  if (site) {
    let label = (opts.website || site).replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    try {
      label = new URL(site).hostname.replace(/^www\./i, "");
    } catch {
      /* keep stripped label */
    }
    return { href: site, label, kind: "website" };
  }
  const maps = toHttpUrl(opts.googleMapsUrl);
  if (maps) return { href: maps, label: "Google Maps", kind: "maps" };
  return null;
}

export function parseCampaignMessage(stepsJson: string): string {
  try {
    const parsed = JSON.parse(stepsJson);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed) && parsed[0]?.message) return parsed[0].message;
    if (parsed && typeof parsed === "object" && parsed.message) return parsed.message;
    return "";
  } catch {
    return stepsJson || "";
  }
}

export function parseCampaignMessages(stepsJson: string): string[] {
  try {
    const parsed = JSON.parse(stepsJson);
    if (typeof parsed === "string") return [parsed];
    if (Array.isArray(parsed)) {
      const messages = parsed.map((step) => typeof step === "string" ? step : step?.message).filter((value): value is string => Boolean(value));
      return messages.length ? messages.slice(0, 2) : [];
    }
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string") return [parsed.message];
  } catch {
    return stepsJson ? [stepsJson] : [];
  }
  return [];
}
