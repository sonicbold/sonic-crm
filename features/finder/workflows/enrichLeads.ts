import { summarizeReviews } from "@/features/finder/llm";
import type { AiRequestPool } from "@/features/finder/ai-pool";
import type { Lead, MapPlace, ParsedRequest, Review } from "@/features/finder/types";
import { throwIfStopped } from "@/features/finder/stop";
import { isUsableLead, usableListedOwner } from "@/features/finder/valid";
import { mapPool, placeKey } from "./pool";

const ENRICH_CONCURRENCY = 2;

export async function enrichLeads(opts: {
  places: MapPlace[];
  reviews: Map<string, Review[]>;
  parsed: ParsedRequest;
  pool: AiRequestPool;
  need: number;
  onPlace?: (info: { current: number; total: number; title: string }) => void;
  onValid?: (lead: Lead, validCount: number) => void;
  accept?: (lead: Lead) => boolean;
  signal?: AbortSignal;
}): Promise<{ leads: Lead[]; attempted: Lead[]; warnings: string[] }> {
  const warnings: string[] = [];
  const attempted: Lead[] = [];
  const accept = opts.accept ?? isUsableLead;
  let validCount = 0;

  await mapPool(opts.places, ENRICH_CONCURRENCY, async (place, i) => {
    throwIfStopped(opts.signal);
    if (validCount >= opts.need) return;
    opts.onPlace?.({ current: i + 1, total: opts.places.length, title: place.title });
    const key = placeKey(place);
    const reviews = opts.reviews.get(key) ?? [];
    const listedOwner = usableListedOwner(place.listedOwnerName, place.title);
    let summary = "";
    let ownerName = listedOwner || "Owner name not found";
    let note: string | undefined;

    try {
      const insight = await summarizeReviews({
        businessName: place.title,
        reviews,
        pool: opts.pool,
        knownOwner: listedOwner || undefined,
      });
      summary = insight.summary;
      ownerName = insight.ownerName;
    } catch (err) {
      summary = reviews.length
        ? "Reviews were found, but the summary step failed."
        : "No recent reviews were available to summarize.";
      note = `Summary skipped: ${err instanceof Error ? err.message : String(err)}`;
      warnings.push(`${place.title}: ${note}`);
    }

    const lead: Lead = {
      index: i + 1,
      ownerName,
      businessName: place.title,
      phone: place.phone || "Not listed",
      location: place.address || opts.parsed.city,
      website: place.website || "No link",
      profileUrl:
        place.url ||
        (place.placeId ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}` : ""),
      summary,
      reviewsCount: place.reviewsCount,
      rating: place.rating ?? null,
      note,
    };
    attempted.push(lead);
    if (accept(lead) && validCount < opts.need) {
      validCount += 1;
      lead.index = validCount;
      opts.onValid?.(lead, validCount);
    }
  });

  const leads = attempted.filter(accept).slice(0, opts.need).map((lead, i) => ({
    ...lead,
    index: i + 1,
  }));

  return { leads, attempted, warnings };
}
