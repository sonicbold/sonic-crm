import {
  PLUMBER_MARKETS,
  rankMarkets,
  searchedCityKeys,
  type MarketCoverage,
} from "@/features/finder/niche";
import { prisma } from "@/shared/db";

function marketKey(city: string, state = ""): string {
  const label = state.trim() ? `${city.trim()}, ${state.trim()}` : city.trim();
  return label.toLowerCase();
}

export async function loadMarketRanking(): Promise<MarketCoverage[]> {
  const [leadGroups, jobs] = await Promise.all([
    prisma.lead.groupBy({
      by: ["city", "state"],
      where: { source: { in: ["finder", "ai_scraper"] } },
      _count: { _all: true },
    }),
    prisma.searchJob.findMany({ select: { location: true, createdAt: true } }),
  ]);

  const leads = new Map<string, number>();
  for (const row of leadGroups) {
    const key = marketKey(row.city || "", row.state || "");
    leads.set(key, (leads.get(key) || 0) + row._count._all);
  }

  const lastSearched = new Map<string, number>();
  for (const job of jobs) {
    for (const city of searchedCityKeys(job.location || "")) {
      const key = city.toLowerCase();
      lastSearched.set(key, Math.max(lastSearched.get(key) || 0, job.createdAt.getTime()));
    }
  }

  return rankMarkets(
    PLUMBER_MARKETS.map((city) => ({
      city,
      leads: leads.get(city.toLowerCase()) || 0,
      lastSearchedAt: lastSearched.get(city.toLowerCase()) || 0,
    })),
  );
}
