import type { AiRequestPool } from "@/features/finder/ai-pool";
import { CANVASS } from "@/features/finder/canvass";
import { clipSummary } from "@/features/finder/owner-name";
import { throwIfStopped } from "@/features/finder/stop";
import type { Review } from "@/features/finder/types";
import { chunk } from "@/features/finder/workflows/pool";

export type SummaryShop = {
  id: string;
  businessName: string;
  reviews: Review[];
};

export const SUMMARY_BATCH_SYSTEM = `You summarize Google reviews for local plumbing shops.

Return JSON only:
{"shops":[{"id":"<data-shop-id from the HTML>","summary":"2-3 sentences"}]}

Write what customers praise or complain about. Do not invent facts. Do not name an owner. Do not guess. If there is no review text, use an empty summary.`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reviewHtml(businessName: string, reviews: Review[], shopId: string): string {
  const items = reviews
    .map((review, index) => {
      const body = escapeHtml(review.text.trim() || "(no customer text)");
      const reply = review.ownerReply?.trim()
        ? `<p>Response from the owner: ${escapeHtml(review.ownerReply.trim())}</p>`
        : `<p>Response from the owner: (none)</p>`;
      return `<article><h3>Review ${index + 1}</h3><p>${body}</p>${reply}</article>`;
    })
    .join("");
  return `<article data-shop-id="${escapeHtml(shopId)}"><h1>${escapeHtml(businessName)}</h1>${items}</article>`;
}

function parseSummaries(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : raw).trim();
    const json = JSON.parse(text) as { shops?: unknown };
    if (!Array.isArray(json.shops)) return out;
    for (const row of json.shops) {
      if (!row || typeof row !== "object") continue;
      const rec = row as { id?: unknown; summary?: unknown };
      const id = String(rec.id ?? "").trim();
      const summary = clipSummary(String(rec.summary ?? ""));
      if (id && summary) out.set(id, summary);
    }
  } catch {
    /* missing ids stay uns summarized */
  }
  return out;
}

/** Gemini writes 2–3 sentence review summaries. Names stay on Groq. */
export async function summarizeShops(
  shops: SummaryShop[],
  opts: { pool: AiRequestPool; signal?: AbortSignal },
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const jobs = shops.filter((shop) => shop.reviews.some((review) => review.text.trim() || review.ownerReply?.trim()));
  const batches = chunk(jobs, CANVASS.ownerNameBatchSize);
  for (const batch of batches) {
    throwIfStopped(opts.signal);
    const result = await opts.pool.complete({
      system: SUMMARY_BATCH_SYSTEM,
      user: `<section>${batch.map((shop) => reviewHtml(shop.businessName, shop.reviews, shop.id)).join("")}</section>`,
      json: true,
    });
    const byId = parseSummaries(result.text);
    for (const shop of batch) {
      const summary = byId.get(shop.id);
      if (summary) found.set(shop.id, summary);
    }
  }
  return found;
}
