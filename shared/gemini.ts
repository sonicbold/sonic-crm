import { getConfig } from "@/shared/settings";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

export type ReplyIntent = "interested" | "not_interested" | "opted_out" | "unclear";

export interface GeminiClassification {
  intent: ReplyIntent;
  confidence: number;
  reason: string;
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in Gemini response");
  return JSON.parse(text.slice(start, end + 1));
}

async function geminiGenerate(prompt: string, json = false, maxOutputTokens = 280): Promise<string> {
  const cfg = await getConfig();
  if (!cfg.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured. Paste it in Settings.");

  let lastErr = "Gemini request failed";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.GEMINI_API_KEY)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: json ? 0.1 : 0.5,
          maxOutputTokens,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      lastErr = data?.error?.message || `Gemini ${model} failed (${res.status})`;
      continue;
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    if (text.trim()) return text.trim();
    lastErr = `Empty Gemini response from ${model}`;
  }
  throw new Error(lastErr);
}

export function quickIntent(body: string): ReplyIntent | null {
  const t = body.toLowerCase();
  if (/\b(stop|unsubscribe|remove me|do not text|don't text|opt out|opt-out)\b/.test(t)) return "opted_out";
  if (/^\s*(no|nope|not interested|nah|leave me alone|busy|go away)\s*[.!]?\s*$/i.test(body.trim())) return "not_interested";
  return null;
}

export async function classifyReply(body: string): Promise<GeminiClassification> {
  const quick = quickIntent(body);
  if (quick === "opted_out") {
    return { intent: "opted_out", confidence: 1, reason: "STOP / opt-out language" };
  }

  const raw = await geminiGenerate(
    `You classify SMS replies from US plumbing business owners to a marketing outreach text.
Return JSON only:
{"intent":"interested"|"not_interested"|"opted_out"|"unclear","confidence":0-1,"reason":"short"}
Rules:
- interested: wants a call, asks pricing, "tell me more", "maybe", questions about the service
- not_interested: no, not now, already have someone, don't contact
- opted_out: STOP, unsubscribe, remove me
- unclear: greeting only or ambiguous
SMS: ${JSON.stringify(body)}`,
    true
  );
  const parsed = extractJson(raw);
  const intent: ReplyIntent = ["interested", "not_interested", "opted_out", "unclear"].includes(parsed.intent)
    ? parsed.intent
    : "unclear";
  return {
    intent: quick === "not_interested" && intent === "unclear" ? "not_interested" : intent,
    confidence: Number(parsed.confidence) || 0.5,
    reason: String(parsed.reason || ""),
  };
}

export async function declineMessage(lead: { name?: string | null; businessName?: string | null }) {
  try {
    const text = await geminiGenerate(
      `Write one short polite SMS (under 140 characters) to a plumbing shop that is not interested in marketing help.
Do not ask a question. Do not sell. Confirm you will not text again.
Name: ${lead.name || "there"}. Business: ${lead.businessName || "your shop"}.
Return only the SMS text.`
    );
    return text.replace(/^["']|["']$/g, "").slice(0, 220);
  } catch {
    return "No problem — I'll take you off the list. Wishing you a busy season.";
  }
}

export async function suggestInterestedReply(
  inbound: string,
  lead: {
    name?: string | null;
    businessName?: string | null;
    city?: string | null;
    website?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
  },
  history: { direction: string; body: string }[]
) {
  const hist = history
    .slice(-8)
    .map((m) => `${m.direction === "outbound" ? "You" : "Them"}: ${m.body}`)
    .join("\n");
  const text = await geminiGenerate(
    `You help a solo US plumber-marketing freelancer draft SMS. Do NOT send as if already sent — this is a SUGGESTED reply for the freelancer to review.
Write one short SMS (under 160 chars) to book a 15-min call.
Use their data: name ${lead.name || "owner"}, shop ${lead.businessName || "the shop"}, city ${lead.city || "their city"}, rating ${lead.rating ?? "n/a"} (${lead.reviewCount ?? 0} reviews), website ${lead.website || "unknown"}.
Thread:
${hist || "(none)"}
Their latest: ${inbound}
Return only the SMS text.`
  );
  return text.replace(/^["']|["']$/g, "").slice(0, 240);
}

export async function writeDailyBrief(snapshot: unknown) {
  const raw = await geminiGenerate(
    `You are the morning operator brief for a solo US freelancer who sells marketing to plumbing shops.
Write from the numbers and names only. Do not invent shops, cities, or results.
Tone: direct, 2-4 sentences, then 2-3 concrete next actions.
Return JSON only:
{"headline":"one line","body":"2-4 sentences covering sent, replies, interested (name + what they said), not interested","actions":["short action","short action"]}
If nothing happened, say so and suggest scraping or starting a drip — still JSON.
Data:
${JSON.stringify(snapshot)}`,
    true,
    420
  );
  const parsed = extractJson(raw);
  return {
    headline: String(parsed.headline || "Operator brief").slice(0, 160),
    body: String(parsed.body || "").slice(0, 900),
    actions: Array.isArray(parsed.actions)
      ? parsed.actions.map((a: unknown) => String(a).slice(0, 120)).filter(Boolean).slice(0, 4)
      : [],
  };
}
