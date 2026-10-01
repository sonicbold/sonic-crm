import type { AiRequestPool } from "@/features/finder/ai-pool";
import { CANVASS } from "@/features/finder/canvass";
import { GPT_OSS_120B_MODEL } from "@/features/finder/llm";
import { isFinderStopped, throwIfStopped } from "@/features/finder/stop";
import type { Review } from "@/features/finder/types";
import { usableListedOwner } from "@/features/finder/valid";
import { chunk } from "@/features/finder/workflows/pool";

export type OwnerShop = {
  id: string;
  businessName: string;
  reviews: Review[];
};

export type ShopInsight = {
  ownerName: string | null;
};

export type NameDetectStats = {
  withReviews: number;
  named: number;
  nameRatePct: number;
};

export type DetectOwnersResult = Map<string, ShopInsight> & { stats: NameDetectStats };

const SUMMARY_MAX = 280;

export const NAME_BATCH_SYSTEM = `You extract personal names of people who work at each shop from Google reviews.

Return JSON only:
{"shops":[{"id":"<data-shop-id from the HTML>","mentions":["Name"]}]}

For each shop, mentions is every personal name of someone who works there: the person who came out, fixed the job, or signed an owner reply. Repeat a name once for every time it is written so the most frequent name can win. Ignore the reviewer byline and the business name. Do not list the shop brand, mascot, or animal (for example Lion from Lion Plumbing). Use an empty array if no personal name is written. Do not pick the owner yourself. Do not guess. Do not summarize.`;

/** One JSON call covers the same shop set as one Apify review batch. */
export const OWNER_BATCH_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    shops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The shop id from the HTML data-shop-id attribute." },
          mentions: {
            type: "array",
            items: { type: "string" },
            description:
              "Every personal name of someone who works at this shop: the person who came out, fixed the job, or signed an owner reply. Repeat a name once for every time it is written. Ignore the reviewer byline and the business name. Empty array if no personal name is written. Do not guess.",
          },
        },
        required: ["id", "mentions"],
        additionalProperties: false,
      },
    },
  },
  required: ["shops"],
  additionalProperties: false,
};

function reviewHasText(reviews: Review[]): boolean {
  return reviews.some((review) => review.text.trim() || review.ownerReply?.trim());
}

function parseMentions(raw: string): string[] {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : raw).trim();
    const json = JSON.parse(text) as { mentions?: unknown; shops?: unknown };
    if (Array.isArray(json.mentions)) {
      return json.mentions.map((name) => String(name).trim()).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

export function clipSummary(raw: string | null | undefined): string | null {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= SUMMARY_MAX) return text;
  const sliced = text.slice(0, SUMMARY_MAX);
  const sentence = sliced.match(/^(.*[.!?])\s/);
  const cut = sentence?.[1]?.trim() || sliced.replace(/\s+\S*$/, "").trim();
  return `${cut || sliced}`.replace(/[.,;:]+$/, "") + ".";
}

function parseShopInsights(raw: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : raw).trim();
    const json = JSON.parse(text) as { shops?: unknown; mentions?: unknown };
    if (Array.isArray(json.shops)) {
      for (const row of json.shops) {
        if (!row || typeof row !== "object") continue;
        const rec = row as { id?: unknown; mentions?: unknown };
        const id = String(rec.id ?? "").trim();
        if (!id) continue;
        const mentions = Array.isArray(rec.mentions)
          ? rec.mentions.map((name) => String(name).trim()).filter(Boolean)
          : [];
        out.set(id, mentions);
      }
    }
  } catch {
    /* caller treats missing ids as no insight */
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function batchHtml(shops: OwnerShop[]): string {
  return `<section>${shops.map((shop) => reviewHtml(shop.businessName, shop.reviews, shop.id)).join("")}</section>`;
}

function reviewHtml(businessName: string, reviews: Review[], shopId?: string): string {
  const items = reviews
    .map((review, index) => {
      const body = escapeHtml(review.text.trim() || "(no customer text)");
      const reply = review.ownerReply?.trim()
        ? `<p>Response from the owner: ${escapeHtml(review.ownerReply.trim())}</p>`
        : `<p>Response from the owner: (none)</p>`;
      return `<article><h3>Review ${index + 1}</h3><p>${body}</p>${reply}</article>`;
    })
    .join("");
  const idAttr = shopId ? ` data-shop-id="${escapeHtml(shopId)}"` : "";
  return `<article${idAttr}><h1>${escapeHtml(businessName)}</h1>${items}</article>`;
}

/**
 * One personal name in the reviews is the owner.
 * Several names: keep the most frequent. A tie keeps the first of those most-frequent names.
 * Reviewer bylines and shop-title fragments are ignored.
 */
export function pickOwnerFromMentions(businessName: string, reviews: Review[], mentions: string[]): string | null {
  const authors = new Set(reviews.map((review) => review.author.trim().toLowerCase()).filter(Boolean));
  const counts = new Map<string, { name: string; count: number }>();
  const order: string[] = [];

  for (const mention of mentions) {
    const name = usableListedOwner(mention, businessName);
    if (!name) continue;
    const key = name.toLowerCase();
    if (authors.has(key)) continue;
    const prev = counts.get(key);
    if (!prev) order.push(key);
    counts.set(key, { name: prev?.name ?? name, count: (prev?.count ?? 0) + 1 });
  }

  if (!counts.size) return null;

  let bestKey = order[0]!;
  let bestCount = counts.get(bestKey)!.count;
  for (const key of order.slice(1)) {
    const count = counts.get(key)!.count;
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return counts.get(bestKey)?.name ?? null;
}

/** @deprecated Use pickOwnerFromMentions */
export function pickRepeatedOwner(businessName: string, reviews: Review[], mentions: string[]): string | null {
  return pickOwnerFromMentions(businessName, reviews, mentions);
}

export function formatNameDetectLog(stats: NameDetectStats): string {
  if (!stats.withReviews) return "Name detection: no shops had review text.";
  return `Name detection: ${stats.named}/${stats.withReviews} shops with reviews (${stats.nameRatePct}%) via Groq openai/gpt-oss-120b.`;
}

function withStats(map: Map<string, ShopInsight>, stats: NameDetectStats): DetectOwnersResult {
  const out = map as DetectOwnersResult;
  out.stats = stats;
  return out;
}

/** Names from Groq GPT-OSS 120B. One call per review-sized shop batch. No summaries. */
export async function detectOwnerNames(
  shops: OwnerShop[],
  opts: { pool: AiRequestPool; signal?: AbortSignal },
): Promise<DetectOwnersResult> {
  const found = new Map<string, ShopInsight>();
  for (const shop of shops) found.set(shop.id, { ownerName: null });
  const jobs = shops.filter((shop) => reviewHasText(shop.reviews));
  const batches = chunk(jobs, CANVASS.ownerNameBatchSize);
  for (const batch of batches) {
    throwIfStopped(opts.signal);
    const apply = (raw: string) => {
      const byId = parseShopInsights(raw);
      for (const shop of batch) {
        const mentions = byId.get(shop.id) ?? (batch.length === 1 ? parseMentions(raw) : []);
        found.set(shop.id, {
          ownerName: pickOwnerFromMentions(shop.businessName, shop.reviews, mentions),
        });
      }
    };
    try {
      const result = await opts.pool.complete({
        system: NAME_BATCH_SYSTEM,
        user: batchHtml(batch),
        json: true,
        model: GPT_OSS_120B_MODEL,
      });
      apply(result.text);
    } catch (err) {
      if (isFinderStopped(err)) throw err;
      if (batch.length === 1) throw err;
      for (const shop of batch) {
        throwIfStopped(opts.signal);
        const one = await opts.pool.complete({
          system: NAME_BATCH_SYSTEM,
          user: batchHtml([shop]),
          json: true,
          model: GPT_OSS_120B_MODEL,
        });
        const mentions = parseShopInsights(one.text).get(shop.id) ?? parseMentions(one.text);
        found.set(shop.id, {
          ownerName: pickOwnerFromMentions(shop.businessName, shop.reviews, mentions),
        });
      }
    }
  }
  const named = jobs.filter((shop) => found.get(shop.id)?.ownerName).length;
  const stats: NameDetectStats = {
    withReviews: jobs.length,
    named,
    nameRatePct: jobs.length ? Math.round((named / jobs.length) * 1000) / 10 : 0,
  };
  return withStats(found, stats);
}

export async function detectOwnerName(opts: {
  businessName: string;
  reviews: Review[];
  pool: AiRequestPool;
  signal?: AbortSignal;
}): Promise<string | null> {
  const found = await detectOwnerNames(
    [{ id: "shop", businessName: opts.businessName, reviews: opts.reviews }],
    opts,
  );
  return found.get("shop")?.ownerName ?? null;
}
