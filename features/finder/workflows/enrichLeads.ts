import { summarizeReviews } from "@/features/finder/llm";
import type { AppSettings, Lead, MapPlace, ParsedRequest, Review } from "@/features/finder/types";
import { mapPool, placeKey } from "./pool";

const ENRICH_CONCURRENCY = 4;

export async function enrichLeads(opts: {
  places: MapPlace[];
  reviews: Map<string, Review[]>;
  parsed: ParsedRequest;
  settings: AppSettings;
  onPlace?: (info: { current: number; total: number; title: string }) => void;
}): Promise<{ leads: Lead[]; warnings: string[] }> {
  const warnings: string[] = [];
  const leads = await mapPool(opts.places, ENRICH_CONCURRENCY, async (place, i) => {
    opts.onPlace?.({ current: i + 1, total: opts.places.length, title: place.title });
    const key = placeKey(place);
    let summary = "";
    let ownerName = "Owner name not found";
    let note: string | undefined;

    try {
      const insight = await summarizeReviews({
        index: i,
        businessName: place.title,
        reviews: opts.reviews.get(key) ?? [],
        groqKey1: opts.settings.GROQ_API_KEY_1,
        groqKey2: opts.settings.GROQ_API_KEY_2,
        groqModel: opts.settings.GROQ_MODEL,
        openrouterKey: opts.settings.OPENROUTER_API_KEY,
        openrouterModel: opts.settings.OPENROUTER_MODEL,
      });
      summary = insight.summary;
      ownerName = insight.ownerName;
    } catch (err) {
      summary = "Reviews were found, but the summary step failed.";
      note = `Summary skipped: ${err instanceof Error ? err.message : String(err)}`;
      warnings.push(`${place.title}: ${note}`);
    }

    return {
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
      note,
    } satisfies Lead;
  });

  return { leads, warnings };
}
