export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

export type SearchFilters = {
  minReviews: number | null;
  maxReviews: number | null;
  minRating: number | null;
  maxRating: number | null;
  website: "any" | "missing" | "required";
  phone: "any" | "required";
  businessStatus: "any" | "operational" | "closed";
};

export type Interpretation = {
  category: string;
  queries: string[];
  locations: string[];
  limit: number;
  filters: SearchFilters;
  segments: number;
  explanation: string;
};

function parsePrompt(prompt: string): Interpretation {
  const lower = prompt.toLowerCase();
  
  // Extract requested limit
  const limitMatch = prompt.match(/\b(\d{1,5})\b/);
  const limit = limitMatch ? Math.min(Math.max(Number(limitMatch[1]), 5), 200) : 25;

  // Extract category
  const categoryMatch = lower.match(
    /\b(plumbers?|roofers?|dentists?|hvac|electricians?|lawyers?|attorneys?|restaurants?|landscapers?|contractors?|painters?|cleaners?|auto repair|mechanics?|gyms?|salons?|realtors?|locksmiths?|solar)\b/
  );
  const rawCat = categoryMatch ? categoryMatch[1] : "local businesses";
  const category = rawCat
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/s$/, "");

  // Extract locations
  const locations: string[] = [];
  const cities = [
    "Huntsville, AL", "Birmingham, AL", "Montgomery, AL", "Mobile, AL",
    "Houston, TX", "Austin, TX", "Dallas, TX", "San Antonio, TX",
    "Miami, FL", "Orlando, FL", "Tampa, FL", "Jacksonville, FL",
    "Atlanta, GA", "Charlotte, NC", "Raleigh, NC", "Nashville, TN",
    "Phoenix, AZ", "Denver, CO", "Las Vegas, NV", "Chicago, IL",
    "New York, NY", "Los Angeles, CA", "San Diego, CA", "Seattle, WA"
  ];

  for (const city of cities) {
    const cityName = city.split(",")[0].toLowerCase();
    if (lower.includes(cityName)) {
      locations.push(`${city}, USA`);
    }
  }

  // Generic location check if no pre-defined city matched
  if (locations.length === 0) {
    const inMatch = prompt.match(/(?:in|near|around)\s+([A-Za-z\s]+(?:,\s*[A-Za-z]{2})?)/i);
    if (inMatch && inMatch[1]) {
      locations.push(inMatch[1].trim());
    } else {
      locations.push("Houston, TX, USA");
    }
  }

  // Filters
  const maxReviews = lower.includes("under 100") || lower.includes("less than 100") ? 99 : null;
  const minReviews = lower.includes("over 50") || lower.includes("more than 50") ? 50 : null;

  const minRatingMatch = lower.match(/(?:more than|at least|over|above|\+)\s*(\d(?:\.\d)?)\s*(?:stars?|rating)?/);
  const minRating = minRatingMatch ? parseFloat(minRatingMatch[1]) : (lower.includes("4+ star") || lower.includes("4 star") ? 4.0 : null);

  const website = lower.includes("no website") || lower.includes("without a website") || lower.includes("missing website")
    ? "missing"
    : lower.includes("with website") || lower.includes("has website")
    ? "required"
    : "any";

  const phone = lower.includes("phone") || lower.includes("with phone") ? "required" : "any";
  const businessStatus = lower.includes("closed") ? "closed" : "operational";

  const segments = Math.max(1, locations.length * (limit > 50 ? 2 : 1));

  return {
    category,
    queries: [category],
    locations,
    limit,
    filters: {
      minReviews,
      maxReviews,
      minRating,
      maxRating: null,
      website,
      phone,
      businessStatus,
    },
    segments,
    explanation: `Searching ${locations.join(", ")} for ${category} businesses (${limit} target leads)${
      minRating ? ` with rating >= ${minRating}` : ""
    }${website === "missing" ? ", strictly without existing websites" : website === "required" ? ", with websites" : ""}.`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Search prompt is required" }, { status: 400 });
    }

    const interpretation = parsePrompt(prompt);
    return NextResponse.json(interpretation);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to parse prompt" }, { status: 500 });
  }
}
