export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { loadSettings } from "@/features/finder/settings";
import { parseRequest } from "@/features/finder/workflows/parseRequest";
import type { ParsedRequest } from "@/features/finder/types";

function toInterpretation(parsed: ParsedRequest) {
  const website =
    parsed.websitePreference === "without"
      ? "missing"
      : parsed.websitePreference === "with"
        ? "required"
        : "any";
  return {
    category: parsed.businessType,
    queries: [parsed.businessType],
    locations: [parsed.city],
    limit: parsed.targetCount,
    filters: {
      minReviews: null,
      maxReviews: parsed.maxReviews,
      minRating: null,
      maxRating: null,
      website,
      phone: "any",
      businessStatus: "operational",
    },
    segments: 1,
    explanation: `Looking for ${parsed.targetCount} ${parsed.businessType} in ${parsed.city}${
      parsed.maxReviews !== null ? `, under ${parsed.maxReviews} reviews` : ""
    }, website: ${parsed.websitePreference}.`,
    parsed,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Search prompt is required" }, { status: 400 });
    }
    const settings = await loadSettings();
    if (!settings.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Add a Gemini API key in Settings before interpreting a search." },
        { status: 400 },
      );
    }
    const parsed = await parseRequest({
      prompt,
      apiKey: settings.GEMINI_API_KEY,
      model: settings.GEMINI_MODEL,
    });
    // #region agent log
    fetch('http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9903e8'},body:JSON.stringify({sessionId:'9903e8',runId:'pre-fix',hypothesisId:'D',location:'app/api/scraper/parse/route.ts:POST',message:'parsed search request',data:{prompt:String(prompt).slice(0,160),city:parsed.city,businessType:parsed.businessType,maxReviews:parsed.maxReviews,websitePreference:parsed.websitePreference,targetCount:parsed.targetCount},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json(toInterpretation(parsed));
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse prompt" },
      { status: 500 },
    );
  }
}
