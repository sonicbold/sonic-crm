import { CANVASS } from "@/features/finder/canvass";
import { isPlumberListing, PLUMBER_MIN_RATING, PLUMBER_QUERIES } from "@/features/finder/niche";
import { classifyWebsite } from "@/shared/website-status";
import type { MapPlace, ParsedRequest } from "./types";

export function hasWebsite(place: MapPlace): boolean {
  return classifyWebsite(place.website).websiteStatus === "has_website";
}

export type FilterStats = {
  kept: MapPlace[];
  droppedReviews: number;
  droppedBelowMin: number;
  droppedWebsite: number;
  droppedOffNiche: number;
  droppedLowRating: number;
};

/**
 * Step 3 — Keep every listing that passes BOTH the review-count filter
 * and the website preference. Do not cap at targetCount: the scrape loop
 * decides how many valid (enriched) leads to keep.
 */
export function filterPlaces(places: MapPlace[], parsed: ParsedRequest): FilterStats {
  const kept: MapPlace[] = [];
  let droppedReviews = 0;
  let droppedBelowMin = 0;
  let droppedWebsite = 0;
  let droppedOffNiche = 0;
  let droppedLowRating = 0;

  for (const place of places) {
    if (!isPlumberListing(place)) {
      droppedOffNiche += 1;
      continue;
    }
    if (place.rating == null || place.rating < PLUMBER_MIN_RATING) {
      droppedLowRating += 1;
      continue;
    }
    if (parsed.minReviews !== null && place.reviewsCount < parsed.minReviews) {
      droppedBelowMin += 1;
      continue;
    }
    if (parsed.maxReviews !== null && place.reviewsCount >= parsed.maxReviews) {
      droppedReviews += 1;
      continue;
    }

    const siteStatus = classifyWebsite(place.website).websiteStatus;
    if (parsed.websitePreference === "without" && siteStatus !== "no_website") {
      droppedWebsite += 1;
      continue;
    }
    if (parsed.websitePreference === "with" && siteStatus !== "has_website") {
      droppedWebsite += 1;
      continue;
    }

    kept.push(place);
  }

  return { kept, droppedReviews, droppedBelowMin, droppedWebsite, droppedOffNiche, droppedLowRating };
}

/** Fetch extra listings so dual filters still leave enough leads. Capped per Maps batch. */
export function oversampleCount(needed: number): number {
  const n = Math.max(1, Math.floor(needed));
  return Math.min(Math.max(n * 3, n + 40), CANVASS.mapsBatchCap);
}

export type MapSearch = {
  query: string;
  location: string;
  /** Ask the Maps actor to grid the city more deeply. Only the first search in a city. */
  exhaustive: boolean;
};

/**
 * One deep Maps search per city, then complementary job searches.
 * See features/finder/canvass.ts before adding queries.
 */
export function mapSearchPlan(city: string, businessType: string): MapSearch[] {
  const queries = mapsQueryVariants(businessType);
  const base = queries[0] || businessType.trim() || "plumbers";
  const cityLabel = city.trim() || "the specified city";
  const plan: MapSearch[] = [];
  const seen = new Set<string>();

  const add = (query: string, location: string, exhaustive: boolean) => {
    const key = `${query.toLowerCase()}|${location.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    plan.push({ query, location, exhaustive });
  };

  add(base, cityLabel, true);
  for (const followUp of CANVASS.followUpQueries) {
    add(followUp, cityLabel, false);
  }
  return plan;
}

export function mapsQueryVariants(businessType: string): string[] {
  const base = businessType.trim() || "plumbers";
  const plumber = /plumb|drain|sewer|rooter/i.test(base) || base === "businesses";
  const variants = plumber
    ? [...PLUMBER_QUERIES]
    : [base, `${base} company`, `${base} contractor`, `${base} services`, `local ${base}`];
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
