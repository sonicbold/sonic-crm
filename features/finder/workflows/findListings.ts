import { searchGoogleMaps } from "@/features/finder/apify";
import { filterPlaces, oversampleCount, type FilterStats } from "@/features/finder/filter";
import type { MapPlace, ParsedRequest } from "@/features/finder/types";

export async function findListings(opts: {
  token: string;
  actorId: string;
  parsed: ParsedRequest;
  maxPlaces?: number;
  query?: string;
}): Promise<{
  rawCount: number;
  fetchCount: number;
  query: string;
  filter: FilterStats;
  places: MapPlace[];
}> {
  const fetchCount = opts.maxPlaces ?? oversampleCount(opts.parsed.targetCount);
  const query = (opts.query || opts.parsed.businessType).trim();
  const rawPlaces = await searchGoogleMaps({
    token: opts.token,
    actorId: opts.actorId,
    businessType: query,
    city: opts.parsed.city,
    maxPlaces: fetchCount,
    websitePreference: opts.parsed.websitePreference,
  });
  const filter = filterPlaces(rawPlaces, opts.parsed);
  return {
    rawCount: rawPlaces.length,
    fetchCount,
    query,
    filter,
    places: filter.kept,
  };
}
