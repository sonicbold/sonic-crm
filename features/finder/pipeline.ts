import { saveCsv } from "@/features/finder/csv";
import { assertReady, loadSettings } from "@/features/finder/settings";
import type { PipelineEvent } from "@/features/finder/types";
import { enrichLeads } from "@/features/finder/workflows/enrichLeads";
import { findListings } from "@/features/finder/workflows/findListings";
import { parseRequest } from "@/features/finder/workflows/parseRequest";
import { pullReviews } from "@/features/finder/workflows/pullReviews";

export async function runPipeline(
  userPrompt: string,
  emit: (event: PipelineEvent) => void,
): Promise<void> {
  const settings = await loadSettings();
  assertReady(settings);
  const warnings: string[] = [];

  try {
    emit({ type: "step", step: 1, label: "Understand the request" });
    emit({ type: "log", message: "Reading your request with Gemini…" });
    const parsed = await parseRequest({
      prompt: userPrompt,
      apiKey: settings.GEMINI_API_KEY,
      model: settings.GEMINI_MODEL,
    });
    emit({ type: "parsed", parsed });
    emit({
      type: "log",
      message: `Looking for ${parsed.targetCount} ${parsed.businessType} in ${parsed.city}${
        parsed.maxReviews !== null ? `, under ${parsed.maxReviews} reviews` : ""
      }, website: ${parsed.websitePreference}.`,
    });

    emit({ type: "step", step: 2, label: "Search Google Maps" });
    const listings = await findListings({
      token: settings.APIFY_API_TOKEN,
      actorId: settings.APIFY_MAPS_ACTOR,
      parsed,
    });
    emit({
      type: "log",
      message: `Asked Apify for up to ${listings.fetchCount} listings; got ${listings.rawCount} unique results.`,
    });

    emit({ type: "step", step: 3, label: "Filter listings" });
    emit({
      type: "log",
      message: `Filter check: dropped ${listings.filter.droppedReviews} for too many reviews, ${listings.filter.droppedWebsite} for website mismatch.`,
    });
    const places = listings.places;
    if (places.length < parsed.targetCount) {
      const msg = `Only ${places.length} businesses in ${parsed.city} matched both filters (you asked for ${parsed.targetCount}). Using the real count.`;
      warnings.push(msg);
      emit({ type: "log", message: msg });
    } else {
      emit({ type: "log", message: `Kept ${places.length} businesses that pass both filters.` });
    }

    if (!places.length) {
      emit({ type: "done", leads: [], warnings, csvFilename: "" });
      return;
    }

    emit({ type: "step", step: 4, label: "Read customer reviews" });
    const reviewResult = await pullReviews({
      token: settings.APIFY_API_TOKEN,
      actorId: settings.APIFY_REVIEWS_ACTOR,
      places,
      onBatch: ({ batchNo, batchTotal, size }) => {
        emit({
          type: "progress",
          current: batchNo,
          total: batchTotal,
          message: `Review batch ${batchNo} of ${batchTotal} (${size} businesses, up to 3 batches at once)…`,
        });
      },
    });
    warnings.push(...reviewResult.warnings);
    for (const w of reviewResult.warnings) emit({ type: "log", message: w });

    emit({ type: "step", step: 5, label: "Summarize reviews & find owners" });
    const enriched = await enrichLeads({
      places,
      reviews: reviewResult.reviews,
      parsed,
      settings,
      onPlace: ({ current, total, title }) => {
        emit({
          type: "progress",
          current,
          total,
          message: `Enriching business ${current} of ${total}… ${title}`,
        });
      },
    });
    warnings.push(...enriched.warnings);
    for (const w of enriched.warnings) emit({ type: "log", message: w });

    emit({ type: "step", step: 6, label: "Build the outreach list" });
    const csvFilename = await saveCsv(enriched.leads);
    emit({ type: "log", message: `Saved spreadsheet as ${csvFilename}` });
    emit({ type: "done", leads: enriched.leads, warnings, csvFilename });
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
