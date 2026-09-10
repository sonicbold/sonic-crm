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
  if (phone.startsWith("+")) return phone;
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned[0] === "1") return `+${cleaned}`;
  return `+${cleaned}`;
}

export function interpolateMessage(
  template: string,
  lead: { name?: string | null; businessName?: string | null; city?: string | null }
): string {
  return template
    .replace(/\{\{name\}\}/g, lead.name || "there")
    .replace(/\{\{business\}\}/g, lead.businessName || "your business")
    .replace(/\{\{city\}\}/g, lead.city || "your area");
}

export function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function parseCampaignSteps(stepsJson: string): { day_offset: number; message: string }[] {
  try { return JSON.parse(stepsJson); } catch { return []; }
}
