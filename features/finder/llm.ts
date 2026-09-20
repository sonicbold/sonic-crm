import Groq from "groq-sdk";
import type { Review } from "@/features/finder/types";

export type ReviewInsight = {
  summary: string;
  ownerName: string;
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

type LlmProvider = {
  name: string;
  complete: (opts: { system: string; user: string; json?: boolean }) => Promise<string>;
};

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

async function groqComplete(apiKey: string, preferredModel: string, opts: { system: string; user: string; json?: boolean }) {
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
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function openrouterComplete(
  apiKey: string,
  model: string,
  opts: { system: string; user: string; json?: boolean },
) {
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
  if (!res.ok) {
    throw new Error(`OpenRouter failed (${res.status}): ${data.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  return data.choices?.[0]?.message?.content ?? "";
}

function listProviders(opts: {
  groqKey1: string;
  groqKey2: string;
  groqModel: string;
  openrouterKey: string;
  openrouterModel: string;
}): LlmProvider[] {
  const providers: LlmProvider[] = [];
  if (opts.groqKey1) {
    providers.push({
      name: "groq-1",
      complete: (call) => groqComplete(opts.groqKey1, opts.groqModel, call),
    });
  }
  if (opts.groqKey2) {
    providers.push({
      name: "groq-2",
      complete: (call) => groqComplete(opts.groqKey2, opts.groqModel, call),
    });
  }
  if (opts.openrouterKey) {
    providers.push({
      name: "openrouter",
      complete: (call) => openrouterComplete(opts.openrouterKey, opts.openrouterModel, call),
    });
  }
  return providers;
}

async function completeWithFallback(
  providers: LlmProvider[],
  startIndex: number,
  call: { system: string; user: string; json?: boolean },
): Promise<string> {
  if (!providers.length) throw new Error("No Groq or OpenRouter key is configured.");
  let lastError: unknown;
  for (let offset = 0; offset < providers.length; offset++) {
    const provider = providers[(startIndex + offset) % providers.length];
    try {
      return await provider.complete(call);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function summarizeReviews(opts: {
  index: number;
  businessName: string;
  reviews: Review[];
  groqKey1: string;
  groqKey2: string;
  groqModel: string;
  openrouterKey: string;
  openrouterModel: string;
}): Promise<ReviewInsight> {
  if (!opts.reviews.length) {
    return { summary: "No recent reviews were available to summarize.", ownerName: "Owner name not found" };
  }

  const providers = listProviders(opts);
  const start = opts.index % Math.max(providers.length, 1);
  const reviewBlock = formatReviews(opts.reviews);
  const user = `Business: ${opts.businessName}\n\n${reviewBlock}`;

  const [summaryRaw, ownerRaw] = await Promise.all([
    completeWithFallback(providers, start, {
      system: 'Summarize these Google reviews in 2-3 sentences. Reply with JSON: {"summary":"..."}.',
      user,
      json: true,
    }),
    completeWithFallback(providers, start, {
      system: OWNER_PROMPT,
      user,
    }),
  ]);

  return {
    summary: parseSummary(summaryRaw),
    ownerName: cleanOwnerName(ownerRaw),
  };
}
