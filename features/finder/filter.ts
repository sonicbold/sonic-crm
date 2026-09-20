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
 * Step 3 — Keep only listings that pass BOTH the review-count filter
 * and the website preference. Stop once we have the requested count.
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
    if (kept.length >= parsed.targetCount) break;
  }

  return { kept, droppedReviews, droppedWebsite };
}

/** Fetch extra listings so dual filters still leave enough leads. */
export function oversampleCount(targetCount: number): number {
  return Math.min(Math.max(targetCount * 3, targetCount + 50), 500);
}
