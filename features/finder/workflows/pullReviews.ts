import { scrapeReviewsBatch } from "@/features/finder/apify";
import type { MapPlace, Review } from "@/features/finder/types";
import { chunk, mapPool, placeKey } from "./pool";

const REVIEW_BATCH_SIZE = 10;
const REVIEW_RUN_CONCURRENCY = 3;

export async function pullReviews(opts: {
  token: string;
  actorId: string;
  places: MapPlace[];
  onBatch?: (info: { batchNo: number; batchTotal: number; size: number }) => void;
}): Promise<{ reviews: Map<string, Review[]>; warnings: string[] }> {
  const batches = chunk(opts.places, REVIEW_BATCH_SIZE);
  const batchTotal = batches.length;
  const reviews = new Map<string, Review[]>();
  const warnings: string[] = [];

  await mapPool(batches, REVIEW_RUN_CONCURRENCY, async (batch, index) => {
    opts.onBatch?.({ batchNo: index + 1, batchTotal, size: batch.length });
    try {
      const result = await scrapeReviewsBatch({
        token: opts.token,
        actorId: opts.actorId,
        places: batch,
      });
      warnings.push(...result.warnings);
      for (const [key, value] of result.reviews) reviews.set(key, value);
    } catch (err) {
      warnings.push(
        `Skipped review batch ${index + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
      for (const place of batch) reviews.set(placeKey(place), []);
    }
  });

  return { reviews, warnings };
}
