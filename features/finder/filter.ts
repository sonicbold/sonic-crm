import type { MapPlace, ParsedRequest } from "./types";

export function hasWebsite(place: MapPlace): boolean {
  return Boolean(place.website);
}

export type FilterStats = {
  kept: MapPlace[];
  droppedReviews: number;
  droppedWebsite: number;
};

/**
 * Step 3 — Keep every listing that passes BOTH the review-count filter
 * and the website preference. Do not cap at targetCount: the scrape loop
 * decides how many valid (enriched) leads to keep.
 */
export function filterPlaces(places: MapPlace[], parsed: ParsedRequest): FilterStats {
  const kept: MapPlace[] = [];
  let droppedReviews = 0;
  let droppedWebsite = 0;

  for (const place of places) {
    if (parsed.maxReviews !== null && place.reviewsCount >= parsed.maxReviews) {
      droppedReviews += 1;
      continue;
    }

    const site = hasWebsite(place);
    if (parsed.websitePreference === "without" && site) {
      droppedWebsite += 1;
      continue;
    }
    if (parsed.websitePreference === "with" && !site) {
      droppedWebsite += 1;
      continue;
    }

    kept.push(place);
  }

  return { kept, droppedReviews, droppedWebsite };
}

/** Fetch extra listings so dual filters still leave enough leads. Capped per Maps batch. */
export function oversampleCount(needed: number): number {
  const n = Math.max(1, Math.floor(needed));
  return Math.min(Math.max(n * 3, n + 40), 400);
}

export function mapsQueryVariants(businessType: string): string[] {
  const base = businessType.trim() || "businesses";
  const variants = [
    base,
    `${base} company`,
    `${base} contractor`,
    `${base} services`,
    `local ${base}`,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
