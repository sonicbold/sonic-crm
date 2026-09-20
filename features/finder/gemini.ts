import type { ParsedRequest, WebsitePreference } from "./types";

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
];

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  return JSON.parse(raw);
}

function asPreference(value: unknown): WebsitePreference {
  const v = String(value ?? "any").toLowerCase();
  if (v.includes("without") || v === "no" || v === "none") return "without";
  if (v.includes("with") || v === "yes") return "with";
  return "any";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeParsed(parsed: Record<string, unknown>): ParsedRequest {
  const targetCount = Math.max(1, Math.min(500, Number(parsed.targetCount) || 50));
  const maxReviewsRaw = parsed.maxReviews;
  const maxReviews =
    maxReviewsRaw === null || maxReviewsRaw === undefined || maxReviewsRaw === ""
      ? null
      : Math.max(0, Number(maxReviewsRaw));

  return {
    businessType: String(parsed.businessType || "").trim() || "businesses",
    city: String(parsed.city || "").trim() || "the specified city",
    maxReviews: Number.isFinite(maxReviews as number) ? maxReviews : null,
    websitePreference: asPreference(parsed.websitePreference),
    targetCount,
  };
}

/** Last-resort parser so a Gemini outage does not block the rest of the pipeline. */
export function parseRequestLocally(prompt: string): ParsedRequest {
  const text = prompt.trim();
  const lower = text.toLowerCase();

  let websitePreference: WebsitePreference = "any";
  if (/\b(no website|without a website|don't have a website|dont have a website)\b/i.test(text)) {
    websitePreference = "without";
  } else if (/\b(with a website|have a website|has a website)\b/i.test(text)) {
    websitePreference = "with";
  }

  const reviewMatch = lower.match(/\b(?:under|below|less than|<)\s*(\d+)\s*reviews?\b/);
  const maxReviews = reviewMatch ? Number(reviewMatch[1]) : null;

  const countMatch = text.match(/\b(?:find|get|scrape|pull)\s+(\d+)\b/i) || text.match(/\b(\d+)\s+(?:\w+\s+){0,3}in\b/i);
  const targetCount = countMatch ? Number(countMatch[1]) : 50;

  const inMatch = text.match(/\bin\s+([^,]+?(?:,\s*[A-Za-z]{2})?)(?=$|,|\bunder\b|\bwith\b|\bwithout\b|\bno website\b)/i);
  const city = inMatch ? inMatch[1].trim() : "the specified city";

  let businessType = "businesses";
  const typeMatch = text.match(/\b(?:find|get|scrape|pull)\s+\d+\s+(.+?)\s+in\s+/i);
  if (typeMatch) businessType = typeMatch[1].trim();

  return {
    businessType,
    city,
    maxReviews,
    websitePreference,
    targetCount: Math.max(1, Math.min(500, targetCount)),
  };
}

async function callGemini(prompt: string, apiKey: string, model: string): Promise<ParsedRequest> {
  const system = `You extract lead-search filters from a user's request.
Return ONLY JSON with these keys:
- businessType: string (e.g. "plumbers")
- city: string (include state when given, e.g. "Houston, TX" or "Austin")
- maxReviews: number or null (review-count upper limit; null if they did not specify)
- websitePreference: "with" | "without" | "any"
- targetCount: number of businesses they want (default 50 if missing)

Rules:
- "no website" / "without a website" / "don't have a website" => websitePreference "without"
- "with a website" / "have a website" => "with"
- if they don't mention websites => "any"
- "under 150 reviews" => maxReviews 150 (exclusive upper bound: keep businesses with fewer than this)
- If count is missing, use 50.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${system}\n\nUser request:\n${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const error = new Error(`Gemini ${model} failed (${res.status}): ${errText.slice(0, 240)}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Gemini ${model} returned an empty response.`);
  return normalizeParsed(extractJson(text) as Record<string, unknown>);
}

/**
 * Step 1 — Ask Gemini to turn a free-text request into structured filters.
 * Retries overloaded models, tries backups, then falls back to a local parser.
 */
export async function parseUserRequest(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<ParsedRequest> {
  const models = [model, ...GEMINI_MODELS.filter((m) => m !== model)];
  let lastError = "";

  for (const candidate of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await callGemini(prompt, apiKey, candidate);
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        lastError = err instanceof Error ? err.message : String(err);
        if (status === 404) break;
        if (status === 503 || status === 429) {
          await sleep(800 * attempt);
          continue;
        }
        break;
      }
    }
  }

  const local = parseRequestLocally(prompt);
  if (local.city !== "the specified city" && local.businessType !== "businesses") {
    return local;
  }

  throw new Error(
    `Gemini is busy right now (${lastError}). Wait a minute and try again — or keep the request in the form "Find 50 plumbers in Austin, under 150 reviews, with no website".`,
  );
}
