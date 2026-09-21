import Groq from "groq-sdk";
import type { AppSettings, Review } from "@/features/finder/types";
import {
  AiRequestPool,
  RateLimitError,
  isDailyLimitMessage,
  isRateLimitError,
  loadAiPoolLimits,
  parseRetryAfterMs,
  retryAfterFromMessage,
  toRateLimitError,
  type AiCompleteCall,
  type AiPoolStatus,
  type AiProviderConfig,
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

const GROQ_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"];

const OWNER_PROMPT = `You are analyzing Google Business reviews for a small plumbing shop. In these businesses the person who showed up or did the work is the owner.

Below are the review texts, including any "Response from the owner" replies.

Your task:
1. Find any personal name in the review text or in a signed owner reply. That name is the owner.
2. Prefer a name tied to phrases like "came out," "fixed," "showed up," "ask for," or a signed owner reply (e.g. "Thanks, - Mike"). If several personal names appear, use the first one in the reviews.
3. Ignore the Google reviewer byline. Do not treat the business name as a person.
4. If no personal name appears in the text, respond with "Owner name not found" — do not guess a name that is not written.
5. Output only the owner's name (first and last if available), with no extra commentary.`;

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

function parseSummary(raw: string): string {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : raw).trim();
    const json = JSON.parse(text) as { summary?: string };
    return String(json.summary ?? "").trim() || "No review summary available.";
  } catch {
    return raw.trim().slice(0, 400) || "No review summary available.";
  }
}

function groqErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const n = Number((err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode);
  return Number.isFinite(n) ? n : undefined;
}

export async function groqComplete(
  apiKey: string,
  preferredModel: string,
  opts: AiCompleteCall,
): Promise<string> {
  const models = [preferredModel, ...GROQ_MODELS.filter((m) => m !== preferredModel)];
  let lastError: unknown;
  for (const model of models) {
    try {
      const groq = new Groq({ apiKey });
      const completion = await groq.chat.completions.create({
        model,
        temperature: 0.1,
        ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      });
      return completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastError = err;
      const status = groqErrorStatus(err);
      if (status === 429 || isRateLimitError(err)) {
        throw toRateLimitError(err, "Groq");
      }
      if (status === 404) continue;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function openrouterComplete(
  apiKey: string,
  model: string,
  opts: AiCompleteCall,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:8080",
      "X-Title": "Lead Finder",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  const message = data.error?.message ?? JSON.stringify(data).slice(0, 200);
  if (res.status === 429 || isRateLimitError({ status: res.status, message })) {
    const retryHeader = res.headers.get("retry-after");
    throw new RateLimitError(`OpenRouter rate limit: ${message}`.slice(0, 400), {
      retryAfterMs: retryHeader ? parseRetryAfterMs(retryHeader) : retryAfterFromMessage(message),
      daily: isDailyLimitMessage(message),
    });
  }
  if (!res.ok) {
    throw new Error(`OpenRouter failed (${res.status}): ${message}`);
  }
  return data.choices?.[0]?.message?.content ?? "";
}

export function createAiPool(
  settings: AppSettings,
  onStatus?: (status: AiPoolStatus) => void,
  overrides?: { now?: () => number; sleep?: (ms: number) => Promise<void> },
): AiRequestPool {
  const limits = loadAiPoolLimits();
  const providers: AiProviderConfig[] = [];
  if (settings.GROQ_API_KEY_1) {
    providers.push({
      id: "groq-1",
      label: "Groq Key 1",
      family: "groq",
      rpm: limits.groqRpm,
      rpd: limits.groqRpd,
      complete: (call) => groqComplete(settings.GROQ_API_KEY_1, settings.GROQ_MODEL, call),
    });
  }
  if (settings.GROQ_API_KEY_2) {
    providers.push({
      id: "groq-2",
      label: "Groq Key 2",
      family: "groq",
      rpm: limits.groqRpm,
      rpd: limits.groqRpd,
      complete: (call) => groqComplete(settings.GROQ_API_KEY_2, settings.GROQ_MODEL, call),
    });
  }
  if (settings.OPENROUTER_API_KEY) {
    providers.push({
      id: "openrouter",
      label: "OpenRouter",
      family: "openrouter",
      rpm: limits.openrouterRpm,
      rpd: limits.openrouterRpd,
      complete: (call) => openrouterComplete(settings.OPENROUTER_API_KEY, settings.OPENROUTER_MODEL, call),
    });
  }
  return new AiRequestPool({
    providers,
    minDelayMs: limits.minDelayMs,
    onStatus,
    now: overrides?.now,
    sleep: overrides?.sleep,
  });
}

export async function summarizeReviews(opts: {
  businessName: string;
  reviews: Review[];
  pool: AiRequestPool;
}): Promise<ReviewInsight> {
  if (!opts.reviews.length) {
    return { summary: "No recent reviews were available to summarize.", ownerName: "Owner name not found" };
  }

  const reviewBlock = formatReviews(opts.reviews);
  const user = `Business: ${opts.businessName}\n\n${reviewBlock}`;

  const [summaryRes, ownerRes] = await Promise.all([
    opts.pool.complete({
      system: 'Summarize these Google reviews in 2-3 sentences. Reply with JSON: {"summary":"..."}.',
      user,
      json: true,
    }),
    opts.pool.complete({
      system: OWNER_PROMPT,
      user,
    }),
  ]);

  return {
    summary: parseSummary(summaryRes.text),
    ownerName: cleanOwnerName(ownerRes.text),
  };
}
