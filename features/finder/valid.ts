import type { Lead, MapPlace } from "@/features/finder/types";

/** Last 10 digits, used to match phones across formats. */
export function phoneKey(phone: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return last10.length === 10 ? last10 : null;
}

export function placeDedupKey(place: Pick<MapPlace, "placeId" | "phone" | "url" | "title">): string {
  if (place.placeId) return `pid:${place.placeId}`;
  const phone = phoneKey(place.phone);
  if (phone) return `ph:${phone}`;
  if (place.url) return `url:${place.url}`;
  return `title:${place.title.trim().toLowerCase()}`;
}

export function hasUsablePhone(place: Pick<MapPlace, "phone">): boolean {
  return phoneKey(place.phone) !== null;
}

/**
 * A valid outreach row: passed filters, has a callable phone, and AI enrichment
 * succeeded. Duplicates are excluded before this check. AI failures do not count.
 */
export function isUsableLead(lead: Lead): boolean {
  if (!phoneKey(lead.phone)) return false;
  if (/^not listed$/i.test((lead.phone || "").trim())) return false;
  const note = (lead.note || "").toLowerCase();
  if (note.includes("summary skipped")) return false;
  if (/summary step failed/i.test(lead.summary || "")) return false;
  return true;
}
