import { CANVASS, citySaturationThreshold, maxMapCallsCeiling } from "@/features/finder/canvass";
import { filterPlaces, mapSearchPlan, oversampleCount } from "@/features/finder/filter";
import { PLUMBER_MIN_RATING } from "@/features/finder/niche";
import { detectOwnerNames, formatNameDetectLog, type NameDetectStats } from "@/features/finder/owner-name";
import { summarizeShops } from "@/features/finder/review-summary";
import { emptySessionMix, sessionPercents, type SessionMix } from "@/features/finder/session-stats";
import { recallMapSearch, rememberMapSearch } from "@/features/finder/place-cache";
import type { AiRequestPool } from "@/features/finder/ai-pool";
import type { AppSettings, Lead, MapPlace, ParsedRequest, PipelineEvent, Review } from "@/features/finder/types";
import { isFinderStopped, throwIfStopped } from "@/features/finder/stop";
import { hasUsablePhone, isTollFreePhone, isUsableLead, listingOwner, phoneKey, placeDedupKey } from "@/features/finder/valid";
import { classifyWebsite, websiteDedupKey } from "@/shared/website-status";
import { emptySpend, estimateTokensFromText, type CanvassSpend } from "@/features/finder/spend";
import { findListings } from "@/features/finder/workflows/findListings";
import { pullReviews } from "@/features/finder/workflows/pullReviews";
import { chunk, placeKey } from "@/features/finder/workflows/pool";

/** See CANVASS in features/finder/canvass.ts. Exhaustive plumbers, then complementary jobs. */

export type CollectDeps = {
  findListings: typeof findListings;
  recallSearch: typeof recallMapSearch;
  rememberSearch: typeof rememberMapSearch;
  pullReviews: typeof pullReviews;
  detectOwners: typeof detectOwnerNames;
  summarizeShops: typeof summarizeShops;
};

export type QueryDone = {
  queryIndex: number;
  leads: Lead[];
};

const defaultDeps: CollectDeps = {
  findListings,
  recallSearch: recallMapSearch,
  rememberSearch: rememberMapSearch,
  pullReviews,
  detectOwners: detectOwnerNames,
  summarizeShops,
};

function leadFromMaps(place: MapPlace, parsed: ParsedRequest, reviewSummary?: string | null): Lead {
  const owner = listingOwner(place);
  const stars = place.rating != null ? `${place.rating} stars` : "no star rating";
  const site = classifyWebsite(place.website).websiteStatus === "has_website" ? "has a website" : "no website listed";
  return {
    index: 0,
    ownerName: owner || "Owner name not found",
    businessName: place.title,
    phone: place.phone,
    location: place.address || parsed.city,
    website: place.website || "No link",
    profileUrl:
      place.url ||
      (place.placeId ? `https://www.google.com/maps/place/?q=place_id:${place.placeId}` : ""),
    summary: reviewSummary || `${place.reviewsCount} reviews, ${stars}, ${site}.`,
    reviewsCount: place.reviewsCount,
    rating: place.rating ?? null,
  };
}

export async function collectValidLeads(opts: {
  parsed: ParsedRequest;
  settings: AppSettings;
  pool: AiRequestPool;
  /** Gemini pool for review summaries. Omit to keep the Maps fallback blurb. */
  summaryPool?: AiRequestPool | null;
  /** Running totals for this Canvass session (shared across cities). */
  sessionMix?: SessionMix;
  existingPhones: Set<string>;
  existingWebsites?: Set<string>;
  emit: (event: PipelineEvent) => void;
  activeProvider: () => string;
  acceptLead?: (lead: Lead) => boolean;
  /** Keep every quality listing in the city. Do not stop at targetCount. */
  fillAll?: boolean;
  /** Skip Maps queries before this index (resume after a pause). */
  startQueryIndex?: number;
  onQueryDone?: (done: QueryDone) => Promise<void>;
  signal?: AbortSignal;
  deps?: Partial<CollectDeps>;
}): Promise<{ leads: Lead[]; warnings: string[]; stopped: boolean; spend: CanvassSpend }> {
  const deps = { ...defaultDeps, ...opts.deps };
  const existingWebsites = opts.existingWebsites ?? new Set<string>();
  const acceptLead = opts.acceptLead ?? isUsableLead;
  const fillAll = opts.fillAll === true;
  const startQueryIndex = Math.max(0, Math.floor(opts.startQueryIndex ?? 0));
  const sessionMix = opts.sessionMix ?? emptySessionMix();
  const warnings: string[] = [];
  const valid: Lead[] = [];
  const seen = new Set<string>();
  const spend = emptySpend();
  const plan = mapSearchPlan(opts.parsed.city, opts.parsed.businessType);
  const maxMapCalls = Math.min(plan.length, maxMapCallsCeiling());
  const target = fillAll ? Number.POSITIVE_INFINITY : Math.max(1, opts.parsed.targetCount);
  const saturation = fillAll ? citySaturationThreshold() : Number.POSITIVE_INFINITY;

  const countingPool = {
    complete: async (call: Parameters<typeof opts.pool.complete>[0]) => {
      const result = await opts.pool.complete(call);
      spend.openrouterCalls += 1;
      spend.openrouterPromptTokens += result.usage?.promptTokens ?? estimateTokensFromText(call.user);
      spend.openrouterCompletionTokens +=
        result.usage?.completionTokens ?? estimateTokensFromText(result.text || "");
      return result;
    },
  } as typeof opts.pool;

  const countingSummary = opts.summaryPool
    ? ({
        complete: async (call: Parameters<typeof opts.summaryPool.complete>[0]) => {
          const result = await opts.summaryPool!.complete(call);
          spend.openrouterCalls += 1;
          spend.openrouterPromptTokens += result.usage?.promptTokens ?? estimateTokensFromText(call.user);
          spend.openrouterCompletionTokens +=
            result.usage?.completionTokens ?? estimateTokensFromText(result.text || "");
          return result;
        },
      } as typeof opts.summaryPool)
    : null;

  const emitStatus = (nextRequestInMs = 0) => {
    spend.newLeads = valid.length;
    const percents = sessionPercents(sessionMix);
    opts.emit({
      type: "status",
      target: fillAll ? valid.length : opts.parsed.targetCount,
      validLeads: valid.length,
      remaining: fillAll ? 0 : Math.max(0, opts.parsed.targetCount - valid.length),
      aiProvider: opts.activeProvider(),
      nextRequestInMs,
      mapsPaidCalls: spend.mapsPaidCalls,
      mapsCacheHits: spend.mapsCacheHits,
      crmDuplicates: spend.crmDuplicates,
      newLeads: spend.newLeads,
      nameRatePct: percents.nameRatePct,
      nameDetectNamed: sessionMix.named,
      nameDetectWithReviews: sessionMix.withReviews,
      websitePct: percents.websitePct,
      noWebsitePct: percents.noWebsitePct,
      withWebsite: sessionMix.withWebsite,
      noWebsite: sessionMix.noWebsite,
    });
  };

  emitStatus(0);

  if (startQueryIndex > 0) {
    opts.emit({
      type: "log",
      message: `Resuming ${opts.parsed.city} at Maps query ${startQueryIndex + 1}.`,
    });
  }

  let stopped = false;
  try {
  for (let call = startQueryIndex; call < maxMapCalls && valid.length < target; call++) {
    throwIfStopped(opts.signal);
    const beforeCount = valid.length;
    const remaining = fillAll ? CANVASS.mapsBatchCap : Math.max(1, opts.parsed.targetCount - valid.length);
    const search = plan[call];
    const maxPlaces = fillAll ? CANVASS.mapsBatchCap : oversampleCount(remaining);
    opts.pool.setRemainingLeads(fillAll ? valid.length : remaining);
    emitStatus(0);

    opts.emit({ type: "step", step: 2, label: "Search Google Maps" });
    opts.emit({
      type: "log",
      message: `Maps batch ${call + 1}: up to ${maxPlaces} “${search.query}” listings in ${search.location}${
        search.exhaustive ? " (deep search)" : ""
      }${fillAll ? "." : ` (need ${remaining} more valid leads).`}`,
    });

    const cached = await deps.recallSearch(search);
    const listings = cached
      ? (() => {
          const filter = filterPlaces(cached, opts.parsed);
          return {
            rawCount: cached.length,
            fetchCount: cached.length,
            query: search.query,
            filter,
            places: filter.kept,
            raw: cached,
          };
        })()
      : await deps.findListings({
          token: opts.settings.APIFY_API_TOKEN,
          actorId: opts.settings.APIFY_MAPS_ACTOR,
          parsed: opts.parsed,
          maxPlaces,
          query: search.query,
          location: search.location,
          exhaustive: search.exhaustive,
          signal: opts.signal,
        });
    if (cached) {
      spend.mapsCacheHits += 1;
      spend.mapsCachedResults += cached.length;
      opts.emit({
        type: "log",
        message: `Reusing ${cached.length} saved Maps listings for “${search.query}” in ${search.location}. No new Apify charge.`,
      });
    } else {
      spend.mapsPaidCalls += 1;
      spend.mapsPaidResults += listings.rawCount;
      await deps.rememberSearch(search, listings.raw);
    }

    opts.emit({
      type: "log",
      message: `Got ${listings.rawCount} unique Maps results; dropped ${listings.filter.droppedOffNiche} outside plumbing, ${listings.filter.droppedLowRating} under ${PLUMBER_MIN_RATING} stars, ${listings.filter.droppedBelowMin} under ${opts.parsed.minReviews ?? 0} reviews, ${listings.filter.droppedReviews} at or over ${opts.parsed.maxReviews ?? "the cap"} reviews, and ${listings.filter.droppedWebsite} for website mismatch.`,
    });

    opts.emit({ type: "step", step: 3, label: "Filter listings" });

    const fresh: MapPlace[] = [];
    let skippedDup = 0;
    let skippedPhone = 0;
    let skippedTollFree = 0;
    let skippedCrm = 0;
    let skippedWebsite = 0;

    for (const place of listings.places) {
      const idKey = placeDedupKey(place);
      if (seen.has(idKey)) {
        skippedDup += 1;
        continue;
      }
      seen.add(idKey);
      if (isTollFreePhone(place.phone)) {
        skippedTollFree += 1;
        continue;
      }
      if (!hasUsablePhone(place)) {
        skippedPhone += 1;
        continue;
      }
      const ph = phoneKey(place.phone)!;
      if (seen.has(`ph:${ph}`) || opts.existingPhones.has(ph)) {
        if (opts.existingPhones.has(ph)) skippedCrm += 1;
        else skippedDup += 1;
        continue;
      }
      const web = websiteDedupKey(place.website);
      if (web && (seen.has(`web:${web}`) || existingWebsites.has(web))) {
        skippedWebsite += 1;
        if (existingWebsites.has(web)) skippedCrm += 1;
        continue;
      }
      seen.add(`ph:${ph}`);
      if (web) {
        seen.add(`web:${web}`);
        existingWebsites.add(web);
      }
      fresh.push(place);
    }

    spend.crmDuplicates += skippedCrm;
    spend.runDuplicates += skippedDup;

    opts.emit({
      type: "log",
      message: `Batch ${call + 1}: ${fresh.length} new businesses to process (${skippedDup} already seen, ${skippedCrm} already in CRM, ${skippedWebsite} same website, ${skippedTollFree} toll-free, ${skippedPhone} missing a phone).`,
    });

    if (!fresh.length) {
      const next = plan[call + 1];
      if (next && call + 1 < maxMapCalls) {
        opts.emit({
          type: "log",
          message: `No new matches for “${search.query}” in ${search.location}. Next search: “${next.query}” in ${next.location}.`,
        });
        if (opts.onQueryDone) await opts.onQueryDone({ queryIndex: call, leads: valid.slice(beforeCount) });
        continue;
      }
      const msg = fillAll
        ? `No new ${opts.parsed.businessType} left in ${opts.parsed.city} for “${search.query}”.`
        : `Google Maps ran out of new ${opts.parsed.businessType} in ${opts.parsed.city} after ${valid.length} valid leads (target was ${opts.parsed.targetCount}).`;
      if (!fillAll) warnings.push(msg);
      opts.emit({ type: "log", message: msg });
      if (opts.onQueryDone) await opts.onQueryDone({ queryIndex: call, leads: valid.slice(beforeCount) });
      if (!fillAll) break;
      continue;
    }

    opts.emit({ type: "step", step: 4, label: "Read reviews" });
    opts.pool.setRemainingLeads(fillAll ? valid.length : remaining);

    const toSave = fillAll ? fresh : fresh.slice(0, remaining);
    const toReview = toSave.filter((place) => !place.ownerChecked);
    let reviews = new Map<string, Review[]>();
    if (toReview.length) {
      opts.emit({ type: "step", step: 5, label: "Read reviews" });
      opts.emit({
        type: "log",
        message: `${toReview.length} ${toReview.length === 1 ? "shop" : "shops"}: pulling reviews. Names via Groq openai/gpt-oss-120b. Summaries via Gemini when a key is set.`,
      });
      const pulled = await deps.pullReviews({
        token: opts.settings.APIFY_API_TOKEN,
        actorId: opts.settings.APIFY_REVIEWS_ACTOR,
        places: toReview,
        signal: opts.signal,
      });
      reviews = pulled.reviews;
      spend.reviewPaidCalls += pulled.apifyCalls ?? 0;
      spend.reviewResults += pulled.resultCount ?? 0;
      warnings.push(...pulled.warnings);
      for (const warning of pulled.warnings) opts.emit({ type: "log", message: warning });
      const withText = toReview.filter((place) =>
        (reviews.get(placeKey(place)) ?? []).some((review) => review.text.trim() || review.ownerReply?.trim()),
      ).length;
      opts.emit({
        type: "log",
        message: `Review text for ${withText}/${toReview.length} shops (${pulled.resultCount ?? 0} Apify review rows).`,
      });
      if ((pulled.resultCount ?? 0) > 0 && withText === 0) {
        const msg = "Apify returned review rows but none matched a shop with text. Owner names will stay empty for this batch.";
        warnings.push(msg);
        opts.emit({ type: "log", message: msg });
      }
    }

    let detected = new Map<string, { ownerName: string | null }>();
    let summaries = new Map<string, string>();
    let nameLookupFailed = false;
    let namesFound = 0;
    let namesChecked = 0;

    const takePlace = (place: MapPlace): boolean => {
      if (!fillAll && valid.length >= opts.parsed.targetCount) return false;
      const insight = detected.get(placeKey(place));
      if (!listingOwner(place) && !place.ownerChecked) {
        const placeReviews = reviews.get(placeKey(place)) ?? [];
        const name = insight?.ownerName ?? null;
        if (name) {
          place.listedOwnerName = name;
          namesFound += 1;
        } else if (!nameLookupFailed && placeReviews.some((review) => review.text.trim() || review.ownerReply?.trim())) {
          place.ownerChecked = true;
          namesChecked += 1;
        }
      }
      const lead = { ...leadFromMaps(place, opts.parsed, summaries.get(placeKey(place))), index: valid.length + 1 };
      if (!acceptLead(lead)) return true;
      valid.push(lead);
      if (classifyWebsite(lead.website).websiteStatus === "has_website") sessionMix.withWebsite += 1;
      else sessionMix.noWebsite += 1;
      opts.existingPhones.add(phoneKey(place.phone)!);
      opts.pool.setRemainingLeads(fillAll ? valid.length : opts.parsed.targetCount - valid.length);
      emitStatus(0);
      return fillAll || valid.length < opts.parsed.targetCount;
    };

    const readyAt = valid.length;
    for (const place of toSave.filter((row) => row.ownerChecked)) {
      throwIfStopped(opts.signal);
      if (!takePlace(place)) break;
    }
    if (opts.onQueryDone && valid.length > readyAt) {
      await opts.onQueryDone({ queryIndex: call, leads: valid.slice(readyAt) });
    }

    const reviewChunks = chunk(toReview, CANVASS.reviewBatchSize);
    for (let piece = 0; piece < reviewChunks.length; piece++) {
      throwIfStopped(opts.signal);
      if (!fillAll && valid.length >= opts.parsed.targetCount) break;
      if (fillAll && valid.length >= saturation) break;
      const group = reviewChunks[piece]!;
      const shops = group.map((place) => ({
        id: placeKey(place),
        businessName: place.title,
        reviews: reviews.get(placeKey(place)) ?? [],
      }));
      opts.emit({ type: "step", step: 5, label: "Owner names" });
      opts.emit({
        type: "log",
        message: `Naming ${shops.length} shops (${piece + 1}/${reviewChunks.length} Groq calls this Maps query). Saving this group before the next call.`,
      });
      const names = await deps
        .detectOwners(shops, { pool: countingPool, signal: opts.signal })
        .catch((err: unknown) => {
          if (isFinderStopped(err)) throw err;
          nameLookupFailed = true;
          const message = err instanceof Error ? err.message : String(err);
          warnings.push(message);
          opts.emit({ type: "log", message: `Owner names skipped (${message})` });
          const withReviews = shops.filter((shop) =>
            shop.reviews.some((review) => review.text.trim() || review.ownerReply?.trim()),
          ).length;
          return Object.assign(new Map(shops.map((shop) => [shop.id, { ownerName: null }])), {
            stats: { withReviews, named: 0, nameRatePct: 0 },
          });
        });
      for (const [id, insight] of names) detected.set(id, insight);
      if ("stats" in names) {
        const stats = (names as { stats?: NameDetectStats }).stats;
        if (stats) {
          sessionMix.named += stats.named;
          sessionMix.withReviews += stats.withReviews;
          opts.emit({ type: "log", message: formatNameDetectLog(stats) });
        }
      }
      if (countingSummary) {
        const texts = await deps
          .summarizeShops(shops, { pool: countingSummary, signal: opts.signal })
          .catch((err: unknown) => {
            if (isFinderStopped(err)) throw err;
            const message = err instanceof Error ? err.message : String(err);
            warnings.push(message);
            opts.emit({ type: "log", message: `Review summaries skipped (${message})` });
            return new Map<string, string>();
          });
        for (const [id, summary] of texts) summaries.set(id, summary);
      }
      const savedAt = valid.length;
      for (const place of group) {
        throwIfStopped(opts.signal);
        if (!takePlace(place)) break;
      }
      if (opts.onQueryDone) await opts.onQueryDone({ queryIndex: call, leads: valid.slice(savedAt) });
    }

    if (namesFound || namesChecked) {
      const named = new Map(
        toSave
          .filter((place) => place.listedOwnerName || place.ownerChecked)
          .map((place) => [placeDedupKey(place), place]),
      );
      for (const raw of listings.raw) {
        const updated = named.get(placeDedupKey(raw));
        if (!updated) continue;
        if (updated.listedOwnerName) raw.listedOwnerName = updated.listedOwnerName;
        if (updated.ownerChecked) raw.ownerChecked = true;
      }
      await deps.rememberSearch(search, listings.raw);
    }

    opts.emit({
      type: "log",
      message: fillAll
        ? `Valid leads in ${opts.parsed.city}: ${valid.length}. Owner names found from reviews: ${namesFound}.`
        : `Valid leads: ${valid.length} / ${opts.parsed.targetCount} (${Math.max(0, opts.parsed.targetCount - valid.length)} remaining). Owner names found from reviews: ${namesFound}.`,
    });

    if (!fillAll && valid.length >= opts.parsed.targetCount) {
      break;
    }

    if (fillAll && valid.length >= saturation) {
      const skipped = plan.slice(call + 1, maxMapCalls).map((step) => step.query);
      if (skipped.length) {
        opts.emit({
          type: "log",
          message: `skipped: saturated (${valid.length} new saved leads ≥ ${saturation}). Not running ${skipped.join(", ")}.`,
        });
      }
      break;
    }

    const next = plan[call + 1];
    if (next && call + 1 < maxMapCalls) {
      opts.emit({
        type: "log",
        message: fillAll
          ? `Next Maps search: “${next.query}” in ${next.location}.`
          : `Still short of the target. Next Maps search: “${next.query}” in ${next.location}.`,
      });
    }
    if (!reviewChunks.length && opts.onQueryDone) {
      await opts.onQueryDone({ queryIndex: call, leads: valid.slice(beforeCount) });
    }
  }
  } catch (err) {
    if (!isFinderStopped(err)) throw err;
    stopped = true;
    const msg = "Finder turned off. Leads found so far will be saved.";
    warnings.push(msg);
    opts.emit({ type: "log", message: msg });
  }

  if (!stopped && fillAll) {
    opts.emit({
      type: "log",
      message: `Finished ${opts.parsed.city} with ${valid.length} valid processed leads.`,
    });
  } else if (!stopped && valid.length < opts.parsed.targetCount) {
    const msg = `Stopped with ${valid.length} valid processed leads (target ${opts.parsed.targetCount}). Duplicate and filter-fail businesses were not counted.`;
    if (!warnings.includes(msg)) warnings.push(msg);
    opts.emit({ type: "log", message: msg });
  } else if (!stopped) {
    opts.emit({
      type: "log",
      message: `Reached target: ${valid.length} valid processed leads.`,
    });
  }

  spend.newLeads = valid.length;
  return { leads: valid, warnings, stopped, spend };
}
