import { oversampleCount, mapsQueryVariants } from "@/features/finder/filter";
import type { AiRequestPool } from "@/features/finder/ai-pool";
import type { AppSettings, Lead, MapPlace, ParsedRequest, PipelineEvent, Review } from "@/features/finder/types";
import { hasUsablePhone, phoneKey, placeDedupKey } from "@/features/finder/valid";
import { enrichLeads } from "@/features/finder/workflows/enrichLeads";
import { findListings } from "@/features/finder/workflows/findListings";
import { pullReviews } from "@/features/finder/workflows/pullReviews";

const MAX_MAP_CALLS = 8;

export type CollectDeps = {
  findListings: typeof findListings;
  pullReviews: typeof pullReviews;
  enrichLeads: typeof enrichLeads;
};

const defaultDeps: CollectDeps = {
  findListings,
  pullReviews,
  enrichLeads,
};

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function collectValidLeads(opts: {
  parsed: ParsedRequest;
  settings: AppSettings;
  pool: AiRequestPool;
  existingPhones: Set<string>;
  emit: (event: PipelineEvent) => void;
  activeProvider: () => string;
  deps?: Partial<CollectDeps>;
}): Promise<{ leads: Lead[]; warnings: string[] }> {
  const deps = { ...defaultDeps, ...opts.deps };
  const warnings: string[] = [];
  const valid: Lead[] = [];
  const seen = new Set<string>();
  const queries = mapsQueryVariants(opts.parsed.businessType);
  let queryIndex = 0;
  let maxPlaces = oversampleCount(opts.parsed.targetCount);
  const maxMapCalls = envInt("FINDER_MAX_MAP_CALLS", MAX_MAP_CALLS);

  const emitStatus = (nextRequestInMs = 0) => {
    opts.emit({
      type: "status",
      target: opts.parsed.targetCount,
      validLeads: valid.length,
      remaining: Math.max(0, opts.parsed.targetCount - valid.length),
      aiProvider: opts.activeProvider(),
      nextRequestInMs,
    });
  };

  emitStatus(0);

  for (let call = 0; call < maxMapCalls && valid.length < opts.parsed.targetCount; call++) {
    const remaining = opts.parsed.targetCount - valid.length;
    const query = queries[Math.min(queryIndex, queries.length - 1)];
    opts.pool.setRemainingLeads(remaining);
    emitStatus(0);

    opts.emit({ type: "step", step: 2, label: "Search Google Maps" });
    opts.emit({
      type: "log",
      message: `Maps batch ${call + 1}: asking Apify for up to ${maxPlaces} “${query}” listings in ${opts.parsed.city} (need ${remaining} more valid leads).`,
    });

    const listings = await deps.findListings({
      token: opts.settings.APIFY_API_TOKEN,
      actorId: opts.settings.APIFY_MAPS_ACTOR,
      parsed: opts.parsed,
      maxPlaces,
      query,
    });

    opts.emit({
      type: "log",
      message: `Got ${listings.rawCount} unique Maps results; dropped ${listings.filter.droppedReviews} for reviews and ${listings.filter.droppedWebsite} for website mismatch.`,
    });

    opts.emit({ type: "step", step: 3, label: "Filter listings" });

    const fresh: MapPlace[] = [];
    let skippedDup = 0;
    let skippedPhone = 0;
    let skippedCrm = 0;

    for (const place of listings.places) {
      const idKey = placeDedupKey(place);
      if (seen.has(idKey)) {
        skippedDup += 1;
        continue;
      }
      seen.add(idKey);
      if (!hasUsablePhone(place)) {
        skippedPhone += 1;
        continue;
      }
      const ph = phoneKey(place.phone)!;
      if (seen.has(`ph:${ph}`)) {
        skippedDup += 1;
        continue;
      }
      seen.add(`ph:${ph}`);
      if (opts.existingPhones.has(ph)) {
        skippedCrm += 1;
        continue;
      }
      fresh.push(place);
    }

    opts.emit({
      type: "log",
      message: `Batch ${call + 1}: ${fresh.length} new businesses to process (${skippedDup} already seen, ${skippedCrm} already in CRM, ${skippedPhone} missing a phone).`,
    });

    if (!fresh.length) {
      const queryExhausted = listings.rawCount < maxPlaces;
      if (queryIndex < queries.length - 1) {
        queryIndex += 1;
        maxPlaces = oversampleCount(remaining);
        opts.emit({
          type: "log",
          message: `No new matches for “${query}”. Trying “${queries[queryIndex]}” next.`,
        });
        continue;
      }
      if (!queryExhausted && maxPlaces < 800) {
        maxPlaces = Math.min(maxPlaces + 200, 800);
        opts.emit({
          type: "log",
          message: `No new unique matches yet; asking Maps for up to ${maxPlaces} results.`,
        });
        continue;
      }
      const msg = `Google Maps ran out of new ${opts.parsed.businessType} in ${opts.parsed.city} after ${valid.length} valid leads (target was ${opts.parsed.targetCount}).`;
      warnings.push(msg);
      opts.emit({ type: "log", message: msg });
      break;
    }

    const buffer = Math.min(fresh.length, Math.max(remaining + 8, Math.ceil(remaining * 1.25)));
    const batch = fresh.slice(0, buffer);

    opts.emit({ type: "step", step: 4, label: "Read customer reviews" });
    const reviewResult = await deps.pullReviews({
      token: opts.settings.APIFY_API_TOKEN,
      actorId: opts.settings.APIFY_REVIEWS_ACTOR,
      places: batch,
      onBatch: ({ batchNo, batchTotal, size }) => {
        opts.emit({
          type: "progress",
          current: batchNo,
          total: batchTotal,
          message: `Review batch ${batchNo} of ${batchTotal} (${size} businesses)…`,
        });
      },
    });
    warnings.push(...reviewResult.warnings);
    for (const w of reviewResult.warnings) opts.emit({ type: "log", message: w });

    opts.emit({ type: "step", step: 5, label: "Summarize reviews & find owners" });
    opts.pool.setRemainingLeads(remaining);

    try {
      const enriched = await deps.enrichLeads({
        places: batch,
        reviews: reviewResult.reviews,
        parsed: opts.parsed,
        pool: opts.pool,
        need: remaining,
        onPlace: ({ current, total, title }) => {
          opts.emit({
            type: "progress",
            current,
            total,
            message: `Enriching business ${current} of ${total}… ${title}`,
          });
        },
        onValid: (lead) => {
          if (valid.length >= opts.parsed.targetCount) return;
          valid.push({ ...lead, index: valid.length + 1 });
          opts.pool.setRemainingLeads(opts.parsed.targetCount - valid.length);
          emitStatus(0);
        },
      });
      warnings.push(...enriched.warnings);
      for (const w of enriched.warnings) opts.emit({ type: "log", message: w });

      for (const lead of enriched.leads) {
        if (valid.length >= opts.parsed.targetCount) break;
        const already = valid.some(
          (row) => row.profileUrl === lead.profileUrl && row.phone === lead.phone,
        );
        if (already) continue;
        valid.push({ ...lead, index: valid.length + 1 });
      }
      emitStatus(0);
      opts.emit({
        type: "log",
        message: `Valid leads: ${valid.length} / ${opts.parsed.targetCount} (${Math.max(0, opts.parsed.targetCount - valid.length)} remaining).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(msg);
      opts.emit({ type: "log", message: msg });
      if (/daily request limit/i.test(msg)) break;
      throw err;
    }

    if (valid.length >= opts.parsed.targetCount) break;

    const queryExhausted = listings.rawCount < maxPlaces;
    if (!queryExhausted) {
      maxPlaces = Math.min(maxPlaces + oversampleCount(remaining), 800);
    } else if (queryIndex < queries.length - 1) {
      queryIndex += 1;
      maxPlaces = oversampleCount(opts.parsed.targetCount - valid.length);
      opts.emit({
        type: "log",
        message: `“${query}” looks exhausted. Next Maps query: “${queries[queryIndex]}”.`,
      });
    }
  }

  if (valid.length < opts.parsed.targetCount) {
    const msg = `Stopped with ${valid.length} valid processed leads (target ${opts.parsed.targetCount}). Invalid, duplicate, and AI-failed businesses were not counted.`;
    if (!warnings.includes(msg)) warnings.push(msg);
    opts.emit({ type: "log", message: msg });
  } else {
    opts.emit({
      type: "log",
      message: `Reached target: ${valid.length} valid processed leads.`,
    });
  }

  return { leads: valid, warnings };
}
