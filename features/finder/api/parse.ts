export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { describeSearch } from "@/features/finder/niche";
import { loadSettings } from "@/features/finder/settings";
import { parseRequest } from "@/features/finder/workflows/parseRequest";
import type { ParsedRequest } from "@/features/finder/types";
import { jsonError } from "@/shared/route";

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
      minReviews: parsed.minReviews,
      maxReviews: parsed.maxReviews,
      minRating: null,
      maxRating: null,
      website,
      phone: "any",
      businessStatus: "operational",
    },
    segments: 1,
    explanation: describeSearch(parsed),
    parsed,
  };
}

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return jsonError("finder.parse", "Search prompt is required", 400);
  }
  const settings = await loadSettings();
  if (!settings.GEMINI_API_KEY) {
    return jsonError("finder.parse", "Add a Gemini API key in Settings before interpreting a search.", 400);
  }
  const parsed = await parseRequest({
    prompt,
    apiKey: settings.GEMINI_API_KEY,
    model: settings.GEMINI_MODEL,
  });
  return NextResponse.json(toInterpretation(parsed));
}
