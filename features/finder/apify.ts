import { ApifyClient } from "apify-client";
import type { MapPlace, Review } from "./types";

/** First N Google reviews per business (Kaix reviews scraper). */
export const REVIEWS_PER_PLACE = 5;

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asWebsite(value: unknown): string | null {
  const v = str(value);
  if (!v) return null;
  const lower = v.toLowerCase();
  if (["n/a", "na", "none", "null", "undefined", "-"].includes(lower)) return null;
  if (
    lower.includes("google.com/maps") ||
    lower.includes("maps.google.") ||
    lower.includes("goo.gl/maps") ||
    lower.startsWith("https://maps.app.goo.gl")
  ) {
    return null;
  }
  return v;
}

function mapsUrl(item: Record<string, unknown>): string {
  const url =
    str(item.googleMapsUri) ||
    str(item.url) ||
    str(item.googleMapsUrl) ||
    str(item.placeUrl);
  if (url && !url.includes("maps.app.goo.gl")) return url;
  const placeId = str(item.placeId);
  if (placeId) return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  return "";
}

function normalizePlace(item: Record<string, unknown>): MapPlace | null {
  const title = str(item.title) || str(item.name);
  if (!title) return null;
  const links = (item.googleMapsLinks as Record<string, unknown> | undefined) ?? {};
  return {
    title,
    phone: str(item.phone) || str(item.phoneIntl) || str(item.phoneUnformatted) || str(item.phoneNumber),
    address: str(item.formattedAddress) || str(item.address) || str(item.street) || str(item.neighborhood),
    website: asWebsite(item.website) || asWebsite(item.websiteUrl) || asWebsite(item.websiteDomain) || asWebsite(item.domain),
    reviewsCount: num(
      item.reviewCount ?? item.reviewsCount ?? item.reviewsTotal ?? item.numberOfReviews,
    ),
    url: mapsUrl(item) || str(links.placeUri) || str(links.reviewsUri),
    placeId: str(item.placeId),
    listedOwnerName: str(item.ownerName) || undefined,
  };
}

function reviewText(item: Record<string, unknown>): string {
  const nested = item.review as Record<string, unknown> | undefined;
  return (
    str(item.text) ||
    str(item.textTranslated) ||
    str(item.reviewText) ||
    str(item.comments) ||
    str(nested?.text)
  );
}

function ownerReplyText(item: Record<string, unknown>): string {
  const reply = item.ownerResponse as Record<string, unknown> | undefined;
  return str(reply?.text) || str(reply?.textTranslated) || str(item.ownerReply);
}

function reviewAuthor(item: Record<string, unknown>): string {
  const author = item.author as Record<string, unknown> | undefined;
  return str(author?.name) || str(item.name) || str(item.reviewerName);
}

function itemPlaceId(item: Record<string, unknown>): string {
  const place = item.place as Record<string, unknown> | undefined;
  return str(item.placeId) || str(place?.placeId);
}

/**
 * Step 2 — Search Google Maps via Kaix places scraper.
 */
export async function searchGoogleMaps(opts: {
  token: string;
  actorId: string;
  businessType: string;
  city: string;
  maxPlaces: number;
  websitePreference: "with" | "without" | "any";
}): Promise<MapPlace[]> {
  const client = new ApifyClient({ token: opts.token });
  const location = /united states|usa|u\.s\.|,/i.test(opts.city)
    ? opts.city
    : `${opts.city}, USA`;
  // Kaix places scraper has no with/without-website input; we filter after scrape.
  void opts.websitePreference;

  const run = await client.actor(opts.actorId).call(
    {
      query: opts.businessType,
      location,
      maxResults: opts.maxPlaces,
      mode: "detailed",
      language: "en",
      searchType: "area",
      includePhotos: false,
      proxyConfiguration: { useApifyProxy: true },
    },
    { waitSecs: 3600 },
  );

  if (!run.defaultDatasetId) {
    throw new Error("Apify Maps run finished without a dataset.");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 10_000 });
  const places: MapPlace[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const place = normalizePlace(raw as Record<string, unknown>);
    if (!place) continue;
    const key = place.placeId || `${place.title}|${place.phone}|${place.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
  }

  return places;
}

function matchPlace(item: Record<string, unknown>, place: MapPlace): boolean {
  const pid = itemPlaceId(item);
  if (place.placeId && pid) return pid === place.placeId;
  const nested = item.place as Record<string, unknown> | undefined;
  const title = str(nested?.name) || str(item.title) || str(item.placeTitle) || str(item.name);
  return Boolean(title) && title.toLowerCase() === place.title.toLowerCase();
}

function reviewsFromItems(items: unknown[], place: MapPlace): Review[] {
  const matched = items.filter((raw) => matchPlace(raw as Record<string, unknown>, place));
  const reviews: Review[] = [];

  for (const raw of matched) {
    const item = raw as Record<string, unknown>;
    const text = reviewText(item);
    const ownerReply = ownerReplyText(item);
    if (!text && !ownerReply) continue;
    reviews.push({
      text,
      author: reviewAuthor(item),
      stars: item.rating !== undefined ? num(item.rating) : item.stars !== undefined ? num(item.stars) : null,
      ownerReply: ownerReply || undefined,
    });
    if (reviews.length >= REVIEWS_PER_PLACE) break;
  }

  return reviews;
}

async function scrapeReviewsOnce(
  client: ApifyClient,
  actorId: string,
  places: MapPlace[],
): Promise<Map<string, Review[]>> {
  const urls = places
    .map((p) => p.placeId || p.url)
    .filter((u) => Boolean(u) && !u.includes("maps.app.goo.gl"));

  if (!urls.length) return new Map();

  const run = await client.actor(actorId).call(
    {
      urls,
      maxReviews: REVIEWS_PER_PLACE,
      sort: "newest",
      language: "en",
      region: "US",
      proxyConfiguration: { useApifyProxy: true },
    },
    { waitSecs: 3600 },
  );

  if (!run.defaultDatasetId) return new Map();
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 10_000 });

  const byKey = new Map<string, Review[]>();
  for (const place of places) {
    const key = place.placeId || place.url || place.title;
    byKey.set(key, reviewsFromItems(items, place));
  }
  return byKey;
}

/**
 * Step 4 — Pull the first 5 newest reviews for a small batch of businesses.
 */
export async function scrapeReviewsBatch(opts: {
  token: string;
  actorId: string;
  places: MapPlace[];
}): Promise<{ reviews: Map<string, Review[]>; warnings: string[] }> {
  const client = new ApifyClient({ token: opts.token });
  const warnings: string[] = [];
  const reviews = new Map<string, Review[]>();

  try {
    const batch = await scrapeReviewsOnce(client, opts.actorId, opts.places);
    for (const [key, value] of batch) reviews.set(key, value);
    return { reviews, warnings };
  } catch (err) {
    warnings.push(
      `Batch review scrape failed (${err instanceof Error ? err.message : String(err)}). Retrying one business at a time.`,
    );
  }

  for (const place of opts.places) {
    const key = place.placeId || place.url || place.title;
    try {
      const one = await scrapeReviewsOnce(client, opts.actorId, [place]);
      reviews.set(key, one.get(key) ?? []);
    } catch (err) {
      warnings.push(
        `Skipped reviews for "${place.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      reviews.set(key, []);
    }
  }

  return { reviews, warnings };
}
