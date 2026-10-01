import { ApifyClient } from "apify-client";
import { FinderStopped, isFinderStopped, throwIfStopped } from "@/features/finder/stop";
import type { MapPlace, Review } from "./types";

/** Newest Google reviews per business (Kaix reviews scraper). */
export const REVIEWS_PER_PLACE = 8;

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

function ratingOf(item: Record<string, unknown>): number | null {
  const raw = item.rating ?? item.totalScore ?? item.stars;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return n;
}

function isPermanentlyClosed(item: Record<string, unknown>): boolean {
  if (item.permanentlyClosed === true) return true;
  const status = str(item.businessStatus) || str(item.status);
  return /permanently[_\s-]?closed|closed_permanently/i.test(status);
}

function categoryOf(item: Record<string, unknown>): string {
  const direct = str(item.categoryName) || str(item.category) || str(item.primaryType);
  if (direct) return direct;
  const categories = item.categories;
  if (Array.isArray(categories) && categories.length) return str(categories[0]);
  return "";
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
  if (!title || isPermanentlyClosed(item)) return null;
  const links = (item.googleMapsLinks as Record<string, unknown> | undefined) ?? {};
  return {
    title,
    phone: str(item.phone) || str(item.phoneIntl) || str(item.phoneUnformatted) || str(item.phoneNumber),
    address: str(item.formattedAddress) || str(item.address) || str(item.street) || str(item.neighborhood),
    website: asWebsite(item.website) || asWebsite(item.websiteUrl) || asWebsite(item.websiteDomain) || asWebsite(item.domain),
    reviewsCount: num(
      item.reviewCount ?? item.reviewsCount ?? item.reviewsTotal ?? item.numberOfReviews,
    ),
    rating: ratingOf(item),
    url: mapsUrl(item) || str(links.placeUri) || str(links.reviewsUri),
    placeId: str(item.placeId),
    category: categoryOf(item) || undefined,
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
  const reply = item.ownerResponse ?? item.responseFromOwner ?? item.ownerReply;
  if (typeof reply === "string") return str(reply);
  if (reply && typeof reply === "object") {
    const rec = reply as Record<string, unknown>;
    return str(rec.text) || str(rec.textTranslated);
  }
  return "";
}

function reviewAuthor(item: Record<string, unknown>): string {
  const author = item.author as Record<string, unknown> | undefined;
  return str(author?.name) || str(item.name) || str(item.reviewerName);
}

function itemPlaceId(item: Record<string, unknown>): string {
  const place = item.place as Record<string, unknown> | undefined;
  return str(item.placeId) || str(place?.placeId);
}

const RUNNING = new Set(["READY", "RUNNING"]);

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new FinderStopped());
    };
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(new FinderStopped());
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Start an actor and poll so Stop can abort the Apify run. */
async function callActor(
  client: ApifyClient,
  actorId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  throwIfStopped(signal);
  const started = await client.actor(actorId).start(input);
  const runClient = client.run(started.id);
  try {
    while (true) {
      throwIfStopped(signal);
      const info = await runClient.get();
      if (!info) throw new Error("Apify run disappeared.");
      if (info.status === "SUCCEEDED") return info;
      if (!RUNNING.has(info.status)) {
        throw new Error(`Apify run ${info.status}.`);
      }
      await sleep(3000, signal);
    }
  } catch (err) {
    if (isFinderStopped(err)) {
      await runClient.abort().catch(() => undefined);
    }
    throw err;
  }
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
  exhaustive?: boolean;
  signal?: AbortSignal;
}): Promise<MapPlace[]> {
  const client = new ApifyClient({ token: opts.token });
  const location = /united states|usa|u\.s\.|,/i.test(opts.city)
    ? opts.city
    : `${opts.city}, USA`;
  // Kaix places scraper has no with/without-website input; we filter after scrape.
  void opts.websitePreference;

  const run = await callActor(
    client,
    opts.actorId,
    {
      query: opts.businessType,
      location,
      maxResults: opts.maxPlaces,
      mode: "detailed",
      language: "en",
      searchType: "area",
      exhaustive: Boolean(opts.exhaustive),
      includePhotos: false,
      proxyConfiguration: { useApifyProxy: true },
    },
    opts.signal,
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
  if (place.placeId && pid && pid === place.placeId) return true;
  const nested = item.place as Record<string, unknown> | undefined;
  const title = str(nested?.name) || str(item.title) || str(item.placeTitle);
  return Boolean(title) && title.toLowerCase() === place.title.toLowerCase();
}

export function reviewsFromItems(items: unknown[], place: MapPlace): Review[] {
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
  signal?: AbortSignal,
): Promise<{ reviews: Map<string, Review[]>; resultCount: number }> {
  const urls = places
    .map((p) => p.placeId || p.url)
    .filter((u) => Boolean(u) && !u.includes("maps.app.goo.gl"));

  if (!urls.length) return { reviews: new Map(), resultCount: 0 };

  const run = await callActor(
    client,
    actorId,
    {
      urls,
      maxReviews: Math.max(REVIEWS_PER_PLACE, 24),
      sort: "newest",
      language: "en",
      region: "US",
      proxyConfiguration: { useApifyProxy: true },
    },
    signal,
  );

  if (!run.defaultDatasetId) return { reviews: new Map(), resultCount: 0 };
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 10_000 });

  const byKey = new Map<string, Review[]>();
  for (const place of places) {
    const key = place.placeId || place.url || place.title;
    byKey.set(key, reviewsFromItems(items, place));
  }
  return { reviews: byKey, resultCount: items.length };
}

/**
 * Step 4 — Pull the newest reviews for a small batch of businesses.
 */
export async function scrapeReviewsBatch(opts: {
  token: string;
  actorId: string;
  places: MapPlace[];
  signal?: AbortSignal;
}): Promise<{ reviews: Map<string, Review[]>; warnings: string[]; apifyCalls: number; resultCount: number }> {
  const client = new ApifyClient({ token: opts.token });
  const warnings: string[] = [];
  const reviews = new Map<string, Review[]>();
  let apifyCalls = 0;
  let resultCount = 0;

  try {
    const batch = await scrapeReviewsOnce(client, opts.actorId, opts.places, opts.signal);
    apifyCalls += 1;
    resultCount += batch.resultCount;
    for (const [key, value] of batch.reviews) reviews.set(key, value);
    return { reviews, warnings, apifyCalls, resultCount };
  } catch (err) {
    warnings.push(
      `Batch review scrape failed (${err instanceof Error ? err.message : String(err)}). Retrying one business at a time.`,
    );
  }

  for (const place of opts.places) {
    const key = place.placeId || place.url || place.title;
    try {
      const one = await scrapeReviewsOnce(client, opts.actorId, [place], opts.signal);
      apifyCalls += 1;
      resultCount += one.resultCount;
      reviews.set(key, one.reviews.get(key) ?? []);
    } catch (err) {
      warnings.push(
        `Skipped reviews for "${place.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      reviews.set(key, []);
    }
  }

  return { reviews, warnings, apifyCalls, resultCount };
}
