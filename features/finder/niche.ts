import type { ParsedRequest } from "@/features/finder/types";

/** Inclusive floor. Shops below this are too new. */
export const PLUMBER_MIN_REVIEWS = 30;

/** Exclusive ceiling. A shop with this many reviews or more is too large. */
export const PLUMBER_MAX_REVIEWS = 150;

/** Minimum Google star rating. */
export const PLUMBER_MIN_RATING = 3;

const PLUMBING =
  /plumb|drain|sewer|rooter|water heater|\bpip(?:e|es|ing)\b|septic|gas line|\bclogs?\b/i;
const NOT_PLUMBING = /supply|wholesale|manufacturer|hardware|retail|showroom|home depot|lowe'?s/i;
const CHAINS =
  /roto-?rooter|mr\.?\s*rooter|mister rooter|benjamin franklin|rescue rooter|\bars\b|one hour heating|service experts|mister sparky|george brazil|michael\s*&\s*son/i;

/** Cities the one-click finder walks, least-covered first. */
export const PLUMBER_MARKETS = [
  "Houston, TX",
  "Dallas, TX",
  "Austin, TX",
  "San Antonio, TX",
  "Fort Worth, TX",
  "Phoenix, AZ",
  "Tucson, AZ",
  "Atlanta, GA",
  "Charlotte, NC",
  "Raleigh, NC",
  "Nashville, TN",
  "Jacksonville, FL",
  "Tampa, FL",
  "Orlando, FL",
  "Miami, FL",
  "Denver, CO",
  "Las Vegas, NV",
  "Oklahoma City, OK",
  "Tulsa, OK",
  "Kansas City, MO",
  "Columbus, OH",
  "Indianapolis, IN",
  "Louisville, KY",
  "Memphis, TN",
  "Birmingham, AL",
  "New Orleans, LA",
  "Albuquerque, NM",
  "Salt Lake City, UT",
  "Boise, ID",
  "Omaha, NE",
];

export const AUTONOMOUS_TARGET = 0;
export const AUTONOMOUS_CITY_CAP = 0;

export type MarketCoverage = {
  city: string;
  leads: number;
  lastSearchedAt: number;
};

export function isChainListing(title: string): boolean {
  return CHAINS.test(title || "");
}

/** Fewest saved leads first, then the city that was searched least recently. */
export function rankMarkets(rows: MarketCoverage[]): MarketCoverage[] {
  return [...rows].sort(
    (a, b) => a.leads - b.leads || a.lastSearchedAt - b.lastSearchedAt || a.city.localeCompare(b.city),
  );
}

/** One saved search can cover several cities. Each city still counts as searched. */
export function searchedCityKeys(location: string): string[] {
  return location
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function marketReason(row: MarketCoverage): string {
  if (row.leads === 0 && row.lastSearchedAt === 0) return "This city has not been searched yet";
  if (row.leads === 0) return "This city was searched before, and no plumbing leads were saved";
  return `${row.leads} plumbing lead${row.leads === 1 ? "" : "s"} already saved here`;
}

export function autonomousRequest(city: string, targetCount: number): ParsedRequest {
  return {
    businessType: "plumbers",
    city,
    minReviews: PLUMBER_MIN_REVIEWS,
    maxReviews: PLUMBER_MAX_REVIEWS,
    websitePreference: "any",
    targetCount,
  };
}

/** Maps queries that stay inside plumbing, instead of generic "contractor" / "services". */
export const PLUMBER_QUERIES = [
  "plumbers",
  "plumbing company",
  "emergency plumber",
  "drain cleaning service",
  "water heater installation",
  "water heater repair",
  "residential plumber",
  "sewer repair",
];

export function reviewBandLabel(minReviews: number | null, maxReviews: number | null): string {
  if (minReviews != null && minReviews > 0 && maxReviews != null && maxReviews > minReviews) {
    return `${minReviews}–${maxReviews - 1} reviews`;
  }
  if (maxReviews != null && maxReviews > 0) return `under ${maxReviews} reviews`;
  if (minReviews != null && minReviews > 0) return `${minReviews}+ reviews`;
  return "any review count";
}

export function describeSearch(parsed: ParsedRequest): string {
  const count =
    parsed.targetCount > 0
      ? `${parsed.targetCount} plumbing businesses`
      : "every qualifying plumbing business";
  return `Looking for ${count} in ${parsed.city}. ${reviewBandLabel(
    parsed.minReviews,
    parsed.maxReviews,
  )}, at least ${PLUMBER_MIN_RATING} stars, with or without a website.`;
}

/** City and count can come from the prompt. Trade, reviews, rating, and website stay fixed. */
export function applyPlumberNiche(parsed: ParsedRequest): ParsedRequest {
  return {
    ...parsed,
    businessType: "plumbers",
    minReviews: PLUMBER_MIN_REVIEWS,
    maxReviews: PLUMBER_MAX_REVIEWS,
    websitePreference: "any",
  };
}

export function isPlumberListing(place: { title: string; category?: string }): boolean {
  const category = (place.category || "").trim();
  const title = place.title || "";
  if (isChainListing(title)) return false;
  const blob = `${title} ${category}`;
  if (NOT_PLUMBING.test(blob)) return false;
  return PLUMBING.test(category) || PLUMBING.test(title);
}
