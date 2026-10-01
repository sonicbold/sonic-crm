import { NextResponse } from "next/server";
import { loadMarketRanking } from "@/features/finder/markets";
import { marketReason, PLUMBER_MARKETS } from "@/features/finder/niche";
import { jsonError } from "@/shared/route";

export const dynamic = "force-dynamic";

export async function GET() {
  const ranked = await loadMarketRanking();
  const next = ranked[0];
  if (!next) {
    return jsonError("finder.next-city", "No plumber markets are configured.", 500);
  }
  return NextResponse.json({
    city: next.city,
    reason: marketReason(next),
    cityCount: PLUMBER_MARKETS.length,
    leads: next.leads,
  });
}
