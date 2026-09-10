import OpenAI from "openai";
import { Lead, Message } from "@prisma/client";

// Lazily initialize to prevent build crash when env is missing
let _openai: OpenAI;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });
  return _openai;
}
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// ============================================================
// AI AGENT — Trained for a Plumbing Marketing Agency
// ============================================================
const SYSTEM_PROMPT = `You are Jordan, a friendly outreach specialist from FlowBoost Marketing — a digital marketing agency exclusively serving plumbing businesses.

What we do:
- We help plumbers get more booked jobs through Google Ads, Local SEO, and a high-converting website
- We specialize ONLY in plumbing — we know the industry inside out
- Our clients typically see 20-40 new customer calls per month within 60 days
- We handle everything: ads, SEO, reputation management, call tracking

Your job: Respond to plumbing business owners who reply to our outreach SMS.

Rules:
1. Be brief and human — this is SMS, keep it under 160 chars when possible
2. Show that you understand THEIR world: emergency calls, slow seasons, Google Local rankings
3. Your main goal is to get them on a quick 15-min call
4. If interested: ask when they have 15 minutes free this week
5. If they have objections (too busy, tried it before, cost): acknowledge, then give a sharp 1-sentence reason why we're different
6. If they say STOP / NO / remove me: "No worries! I've removed you — good luck with everything." — then stop
7. Never use jargon. Sound like a real person texting
8. Pain points to reference: slow season, Google competitors stealing calls, bad leads from Home Advisor, needing consistent jobs
9. Never pretend to be AI. You are Jordan, a real person

Sign your first reply with "- Jordan @ FlowBoost"`;

export interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral" | "opted_out";
  isInterested: boolean;
  confidence: number;
}

export async function analyzeSentiment(body: string): Promise<SentimentResult> {
  const res = await getOpenAI().chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Classify this SMS reply from a plumbing business owner. Return JSON:
{
  "sentiment": "positive" | "negative" | "neutral" | "opted_out",
  "isInterested": boolean,
  "confidence": 0.0-1.0
}
- positive: open to chat, asking questions, sounds interested
- negative: not interested, annoyed, busy, no
- neutral: vague, just asking a question with no clear intent
- opted_out: says STOP, remove me, unsubscribe, don't text me
Respond with valid JSON only.`,
      },
      { role: "user", content: `Reply: "${body}"` },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });
  try {
    const r = JSON.parse(res.choices[0].message.content || "{}");
    return { sentiment: r.sentiment ?? "neutral", isInterested: r.isInterested ?? false, confidence: r.confidence ?? 0.5 };
  } catch {
    return { sentiment: "neutral", isInterested: false, confidence: 0.5 };
  }
}

export async function generateReply(
  inboundMessage: string,
  lead: { name?: string | null; businessName?: string | null; city?: string | null },
  history: { direction: string; body: string }[]
): Promise<string> {
  const historyMsgs = history.slice(-6).map((m) => ({
    role: (m.direction === "outbound" ? "assistant" : "user") as "assistant" | "user",
    content: m.body,
  }));

  const res = await getOpenAI().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Lead: ${lead.name || "business owner"}, Business: ${lead.businessName || "plumbing company"}, City: ${lead.city || "unknown city"}`,
      },
      ...historyMsgs,
      { role: "user", content: inboundMessage },
    ],
    temperature: 0.75,
    max_tokens: 180,
  });

  return res.choices[0].message.content?.trim() ?? "Thanks for getting back to me! I will follow up shortly. - Jordan @ FlowBoost";
}


