/** Estimated Apify + OpenRouter spend for a Canvass run. Rates are overridable. */

export type CanvassSpend = {
  mapsPaidCalls: number;
  mapsCacheHits: number;
  mapsPaidResults: number;
  mapsCachedResults: number;
  reviewPaidCalls: number;
  reviewResults: number;
  crmDuplicates: number;
  runDuplicates: number;
  newLeads: number;
  openrouterCalls: number;
  openrouterPromptTokens: number;
  openrouterCompletionTokens: number;
};

export type CanvassCost = {
  apifyUsd: number;
  openrouterUsd: number;
  totalUsd: number;
  costPerLeadUsd: number | null;
  rates: {
    mapsUsdPer1k: number;
    reviewsUsdPer1k: number;
    openrouterUsdPer1mPrompt: number;
    openrouterUsdPer1mCompletion: number;
  };
};

function envFloat(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function emptySpend(): CanvassSpend {
  return {
    mapsPaidCalls: 0,
    mapsCacheHits: 0,
    mapsPaidResults: 0,
    mapsCachedResults: 0,
    reviewPaidCalls: 0,
    reviewResults: 0,
    crmDuplicates: 0,
    runDuplicates: 0,
    newLeads: 0,
    openrouterCalls: 0,
    openrouterPromptTokens: 0,
    openrouterCompletionTokens: 0,
  };
}

export function addSpend(into: CanvassSpend, part: Partial<CanvassSpend>): CanvassSpend {
  const keys = Object.keys(into) as (keyof CanvassSpend)[];
  for (const key of keys) {
    const extra = part[key];
    if (typeof extra === "number") into[key] += extra;
  }
  return into;
}

export function loadSpendRates() {
  return {
    /** Kaix Maps actor is billed per dataset item. Override if your Apify price page differs. */
    mapsUsdPer1k: envFloat("FINDER_APIFY_MAPS_USD_PER_1K", 5),
    reviewsUsdPer1k: envFloat("FINDER_APIFY_REVIEWS_USD_PER_1K", 4),
    /** OpenRouter list price for inference-net/schematron-v2-turbo. */
    openrouterUsdPer1mPrompt: envFloat("FINDER_OPENROUTER_USD_PER_1M_PROMPT", 0.03),
    openrouterUsdPer1mCompletion: envFloat("FINDER_OPENROUTER_USD_PER_1M_COMPLETION", 0.15),
  };
}

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCost(spend: CanvassSpend, savedLeads = spend.newLeads): CanvassCost {
  const rates = loadSpendRates();
  const apifyUsd =
    (spend.mapsPaidResults / 1000) * rates.mapsUsdPer1k + (spend.reviewResults / 1000) * rates.reviewsUsdPer1k;
  const openrouterUsd =
    (spend.openrouterPromptTokens / 1_000_000) * rates.openrouterUsdPer1mPrompt +
    (spend.openrouterCompletionTokens / 1_000_000) * rates.openrouterUsdPer1mCompletion;
  const totalUsd = apifyUsd + openrouterUsd;
  return {
    apifyUsd,
    openrouterUsd,
    totalUsd,
    costPerLeadUsd: savedLeads > 0 ? totalUsd / savedLeads : null,
    rates,
  };
}

function money(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

export function formatSpendLog(spend: CanvassSpend, cost = estimateCost(spend)): string {
  const perLead = cost.costPerLeadUsd == null ? "n/a" : money(cost.costPerLeadUsd);
  return [
    `Apify Maps ${spend.mapsPaidCalls} paid / ${spend.mapsCacheHits} cache (${spend.mapsPaidResults} billed listings, ${spend.mapsCachedResults} reused).`,
    `Apify reviews ${spend.reviewPaidCalls} paid (${spend.reviewResults} review rows).`,
    `New leads ${spend.newLeads}, CRM dups ${spend.crmDuplicates}, already-seen ${spend.runDuplicates}.`,
    `OpenRouter ${spend.openrouterCalls} calls (${spend.openrouterPromptTokens} in / ${spend.openrouterCompletionTokens} out tokens).`,
    `Est. spend this run: Apify ${money(cost.apifyUsd)}, OpenRouter ${money(cost.openrouterUsd)}, ${perLead}/saved lead.`,
  ].join(" ");
}

export function costSummaryCsv(spend: CanvassSpend, cost = estimateCost(spend)): string {
  const perLead = cost.costPerLeadUsd == null ? "" : cost.costPerLeadUsd.toFixed(6);
  const header = [
    "maps_paid_calls",
    "maps_cache_hits",
    "maps_paid_results",
    "maps_cached_results",
    "review_paid_calls",
    "review_results",
    "new_leads",
    "crm_duplicates",
    "apify_usd",
    "openrouter_usd",
    "total_usd",
    "cost_per_saved_lead_usd",
  ];
  const row = [
    spend.mapsPaidCalls,
    spend.mapsCacheHits,
    spend.mapsPaidResults,
    spend.mapsCachedResults,
    spend.reviewPaidCalls,
    spend.reviewResults,
    spend.newLeads,
    spend.crmDuplicates,
    cost.apifyUsd.toFixed(6),
    cost.openrouterUsd.toFixed(6),
    cost.totalUsd.toFixed(6),
    perLead,
  ];
  return ["COST_SUMMARY", header.join(","), row.join(",")].join("\n");
}
