/**
 * Canvass is the lead finder. Read this before changing search, filters, dedupe, or Apify use.
 *
 * Goal: build an SMS list of independent US plumbing shops we can text about a website,
 * SEO, or an AI receptionist.
 *
 * A kept lead has a local phone, sits in the review band, has at least 3 stars, is not a
 * chain or a supplier, and is not already in the CRM by phone or by the same real website.
 * Facebook and Yelp do not count as a website, so two shops without a site stay distinct.
 * Toll-free numbers are call centers, not the shop, so they never count.
 *
 * Volume comes from walking every plumber city. Each city starts with one deep
 * "plumbers" search. Drain cleaning and water heater installation run only if
 * that city is still below CITY_SATURATION_THRESHOLD new saved leads. Saved
 * searches are reused. Do not add plumber-synonym queries — they re-buy the
 * same listings. Maps already has phone, website, rating, and review count.
 * Reviews are pulled for shops we keep. Groq GPT-OSS 120B lists personal names
 * from reviews (keys rotate). One name becomes the owner; several names keep the
 * most frequent. A tie keeps the first of those most-frequent names. The name must
 * sound like a person (Mike, Jose, Pat Lee). Shop brands and mascots such as Lion
 * from Lion Plumbing are not owners. Gemini Flash (separate keys) writes a
 * 2–3 sentence review summary and never picks an owner. Canvass shows this
 * session's name-detection % (named / shops with review text) and the % of saved
 * leads with vs without a real website. If Maps already lists a real owner
 * person, that name stays. Never guess an owner from the shop title.
 *
 * FINDER_LEAD_CAP, when set, saves that many new shops as one batch, then the same
 * Turn-on run starts the next batch by itself. Turn off is the only stop. Unset the
 * cap to walk cities without a batch size.
 *
 * A mid-search shutdown pauses the run. The next Maps query and finished cities are
 * stored. After the PC or Docker comes back, Canvass continues there. Leads already
 * named are saved to the CRM as each Maps query finishes.
 *
 * Do not add area slices. Do not drop the phone dedupe, website dedupe, or the toll-free filter.
 */
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const CANVASS = {
  name: "Canvass",
  /** Ceiling on Maps queries per city. Complementary searches run only if the city is still thin. */
  maxMapCalls: 3,
  /** Skip remaining city queries once this many new shops were saved from earlier queries. */
  citySaturationThreshold: 40,
  /** Shops per Apify review run. */
  reviewBatchSize: 10,
  /** Shops per Groq name call. Ten shops of review HTML trips Groq's TPM "request too large". */
  ownerNameBatchSize: 3,
  followUpQueries: ["drain cleaning service", "water heater installation"] as const,
  /** @deprecated Use followUpQueries[0] */
  followUpQuery: "drain cleaning service",
  /** Hard cap on listings requested from one Maps call. */
  mapsBatchCap: 400,
} as const;

export function citySaturationThreshold(): number {
  return envInt("FINDER_CITY_SATURATION", CANVASS.citySaturationThreshold);
}

export function maxMapCallsCeiling(): number {
  return envInt("FINDER_MAX_MAP_CALLS", CANVASS.maxMapCalls);
}

/** Batch size for new shops. Null means walk cities without a count cap. */
export function leadCap(): number | null {
  const n = Number(process.env.FINDER_LEAD_CAP);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** Keep this city open when a batch cap cut the walk short. */
export function shouldMarkCityDone(opts: { stopped: boolean; hitLeadCap: boolean }): boolean {
  return !opts.stopped && !opts.hitLeadCap;
}

/** After a 10-lead batch, keep the same Turn-on run going until the user stops it. */
export function shouldContinueAfterBatch(opts: {
  leadCap: number | null;
  hitLeadCap: boolean;
  paused: boolean;
  error: string | null;
  leadCount: number;
}): boolean {
  if (opts.paused || opts.error) return false;
  if (!opts.leadCap) return false;
  return opts.hitLeadCap && opts.leadCount > 0;
}
