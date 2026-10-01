import Groq from "groq-sdk";
import type { AppSettings, Review } from "@/features/finder/types";
import {
  AiRequestPool,
  RateLimitError,
  isRateLimitError,
  loadAiPoolLimits,
  toRateLimitError,
  type AiCompleteCall,
  type AiPoolStatus,
} from "@/features/finder/ai-pool";

export type ReviewInsight = {
  summary: string;
  ownerName: string;
};

export {
  AiRequestPool,
  RateLimitError,
  isRateLimitError,
  loadAiPoolLimits,
  toRateLimitError,
};

const SUMMARY_PROMPT =
  'Summarize these Google reviews in 2-3 sentences. Reply with JSON: {"summary":"..."}.';

const INSIGHT_PROMPT = `You read Google reviews for a local service business. The person who did the work or signed an owner reply is usually the owner.

Return JSON only: {"summary":"...","ownerName":"..."}.
- summary: 2-3 sentences on what customers praise or complain about.
- ownerName: a personal name written in the review text or a signed owner reply (for example "Thanks, - Mike"). Prefer a name tied to "came out", "fixed", "showed up", or "ask for". Ignore the reviewer byline and the business name. If no personal name is written, use "Owner name not found". Do not guess.`;

function formatReviews(reviews: Review[]): string {
  return reviews
    .map((r, i) => {
      const stars = r.stars !== null ? `${r.stars}★` : "unrated";
      const reply = r.ownerReply
        ? `\nResponse from the owner: ${r.ownerReply}`
        : "\nResponse from the owner: (none)";
      return `Review ${i + 1} (${stars}):\n${r.text || "(no customer text)"}${reply}`;
    })
    .join("\n\n");
}

function cleanOwnerName(raw: string): string {
  const name = raw.replace(/^["'\s]+|["'\s]+$/g, "").trim();
  if (!name) return "Owner name not found";
  const lower = name.toLowerCase();
  if (
    lower === "not found" ||
    lower === "owner name not found" ||
    lower.includes("not found") ||
    lower.includes("cannot") ||
    lower.includes("can't")
  ) {
    return "Owner name not found";
  }
  return name.split(/\n/)[0].trim() || "Owner name not found";
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : raw).trim();
    const json = JSON.parse(text) as unknown;
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseSummary(raw: string): string {
  const json = parseJsonObject(raw);
  if (json) return String(json.summary ?? "").trim() || "No review summary available.";
  return raw.trim().slice(0, 400) || "No review summary available.";
}

function parseInsight(raw: string): ReviewInsight {
  const json = parseJsonObject(raw);
  if (!json) {
    return {
      summary: raw.trim().slice(0, 400) || "No review summary available.",
      ownerName: "Owner name not found",
    };
  }
  return {
    summary: String(json.summary ?? "").trim() || "No review summary available.",
    ownerName: cleanOwnerName(String(json.ownerName ?? "")),
  };
}

function groqErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const n = Number((err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode);
  return Number.isFinite(n) ? n : undefined;
}

export const GPT_OSS_120B_MODEL = "openai/gpt-oss-120b";
export const GROQ_CONCURRENT = 1;
export const GEMINI_CONCURRENT = 1;
export const GEMINI_SLOT_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"] as const;

export async function geminiComplete(
  apiKey: string,
  model: string,
  opts: AiCompleteCall,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: 0,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system.trim()) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const errText = await res.text();
    const error = new Error(`Gemini ${model} failed (${res.status}): ${errText.slice(0, 240)}`);
    (error as Error & { status?: number }).status = res.status;
    if (res.status === 429 || isRateLimitError(error)) throw toRateLimitError(error, "Gemini");
    throw error;
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

function geminiSlots(settings: AppSettings): { key: string; model: string; label: string }[] {
  const keys = [settings.GEMINI_API_KEY, settings.GEMINI_API_KEY_2, settings.GEMINI_API_KEY_3];
  const models = [settings.GEMINI_MODEL || GEMINI_SLOT_MODELS[0], GEMINI_SLOT_MODELS[1], GEMINI_SLOT_MODELS[2]];
  const labels = ["Gemini 1 summaries", "Gemini 2 summaries", "Gemini 3 summaries"];
  return keys
    .map((key, index) => ({ key: key.trim(), model: models[index] || GEMINI_SLOT_MODELS[0], label: labels[index]! }))
    .filter((row) => row.key);
}

export async function groqComplete(
  apiKey: string,
  preferredModel: string,
  opts: AiCompleteCall,
): Promise<string> {
  const model = (opts.model || preferredModel).trim() || GPT_OSS_120B_MODEL;
  try {
    const groq = new Groq({ apiKey, timeout: 45_000 });
    const completion = await groq.chat.completions.create({
      model,
      temperature: 0,
      ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
      messages: [
        ...(opts.system.trim() ? [{ role: "system" as const, content: opts.system }] : []),
        { role: "user" as const, content: opts.user },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    const status = groqErrorStatus(err);
    if (status === 429 || isRateLimitError(err)) {
      throw toRateLimitError(err, "Groq");
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function groqKeys(settings: AppSettings): string[] {
  return [settings.GROQ_API_KEY_1, settings.GROQ_API_KEY_2, settings.GROQ_API_KEY_3]
    .map((key) => key.trim())
    .filter(Boolean);
}

/**
 * Owner names use GPT-OSS 120B on Groq (`openai/gpt-oss-120b`).
 * Calls rotate across the configured Groq keys.
 */
export function createAiPool(
  settings: AppSettings,
  onStatus?: (status: AiPoolStatus) => void,
  overrides?: { now?: () => number; sleep?: (ms: number) => Promise<void> },
): AiRequestPool {
  const limits = loadAiPoolLimits();
  const keys = groqKeys(settings);
  if (!keys.length) {
    throw new Error("Add a Groq API key in Settings before finding owner names.");
  }
  return new AiRequestPool({
    providers: keys.map((key, index) => ({
      id: `groq-${index + 1}`,
      label: `Groq ${index + 1} GPT-OSS 120B`,
      family: "groq" as const,
      rpm: limits.groqRpm,
      rpd: limits.groqRpd,
      maxConcurrent: GROQ_CONCURRENT,
      complete: (call) => groqComplete(key, call.model || GPT_OSS_120B_MODEL, call),
    })),
    minDelayMs: limits.minDelayMs,
    onStatus,
    now: overrides?.now,
    sleep: overrides?.sleep,
  });
}

/**
 * Review summaries use Gemini Flash on a separate pool so they never share Groq RPM.
 * Key 1 = GEMINI_MODEL (default 3.6-flash), key 2 = 3.5-flash, key 3 = 2.5-flash.
 */
export function createSummaryPool(
  settings: AppSettings,
  onStatus?: (status: AiPoolStatus) => void,
  overrides?: { now?: () => number; sleep?: (ms: number) => Promise<void> },
): AiRequestPool | null {
  const slots = geminiSlots(settings);
  if (!slots.length) return null;
  const limits = loadAiPoolLimits();
  return new AiRequestPool({
    providers: slots.map((slot, index) => ({
      id: `gemini-${index + 1}`,
      label: slot.label,
      family: "gemini" as const,
      rpm: limits.geminiRpm,
      rpd: limits.geminiRpd,
      maxConcurrent: GEMINI_CONCURRENT,
      complete: (call) => geminiComplete(slot.key, call.model || slot.model, call),
    })),
    minDelayMs: limits.minDelayMs,
    onStatus,
    now: overrides?.now,
    sleep: overrides?.sleep,
  });
}

/** Unused by Canvass. Kept for the old per-shop enrich path. */
export async function summarizeReviews(opts: {
  businessName: string;
  reviews: Review[];
  pool: AiRequestPool;
  knownOwner?: string;
}): Promise<ReviewInsight> {
  const known = cleanOwnerName(opts.knownOwner || "");
  const hasKnown = known !== "Owner name not found";
  if (!opts.reviews.length) {
    return {
      summary: "No recent reviews were available to summarize.",
      ownerName: hasKnown ? known : "Owner name not found",
    };
  }

  const user = `Business: ${opts.businessName}\n\n${formatReviews(opts.reviews)}`;
  if (hasKnown) {
    const summaryRes = await opts.pool.complete({
      system: SUMMARY_PROMPT,
      user,
      json: true,
    });
    return { summary: parseSummary(summaryRes.text), ownerName: known };
  }

  const insightRes = await opts.pool.complete({
    system: INSIGHT_PROMPT,
    user,
    json: true,
  });
  return parseInsight(insightRes.text);
}
