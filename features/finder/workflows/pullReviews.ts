import { scrapeReviewsBatch } from "@/features/finder/apify";
import { CANVASS } from "@/features/finder/canvass";
import { isFinderStopped } from "@/features/finder/stop";
import type { MapPlace, Review } from "@/features/finder/types";
import { chunk, mapPool, placeKey } from "./pool";

const REVIEW_RUN_CONCURRENCY = 3;

export async function pullReviews(opts: {
  token: string;
  actorId: string;
  places: MapPlace[];
  onBatch?: (info: { batchNo: number; batchTotal: number; size: number }) => void;
  signal?: AbortSignal;
}): Promise<{
  reviews: Map<string, Review[]>;
  warnings: string[];
  apifyCalls: number;
  resultCount: number;
}> {
  const batches = chunk(opts.places, CANVASS.reviewBatchSize);
  const batchTotal = batches.length;
  const reviews = new Map<string, Review[]>();
  const warnings: string[] = [];
  let apifyCalls = 0;
  let resultCount = 0;

  await mapPool(batches, REVIEW_RUN_CONCURRENCY, async (batch, index) => {
    opts.onBatch?.({ batchNo: index + 1, batchTotal, size: batch.length });
    try {
      const result = await scrapeReviewsBatch({
        token: opts.token,
        actorId: opts.actorId,
        places: batch,
        signal: opts.signal,
      });
      warnings.push(...result.warnings);
      apifyCalls += result.apifyCalls;
      resultCount += result.resultCount;
      for (const [key, value] of result.reviews) reviews.set(key, value);
    } catch (err) {
      if (isFinderStopped(err)) throw err;
      warnings.push(
        `Skipped review batch ${index + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
      for (const place of batch) reviews.set(placeKey(place), []);
    }
  });

  return { reviews, warnings, apifyCalls, resultCount };
}
