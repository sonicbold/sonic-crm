import { searchGoogleMaps } from "@/features/finder/apify";
import { filterPlaces, oversampleCount, type FilterStats } from "@/features/finder/filter";
import type { MapPlace, ParsedRequest } from "@/features/finder/types";

export async function findListings(opts: {
  token: string;
  actorId: string;
  parsed: ParsedRequest;
}): Promise<{
  rawCount: number;
  fetchCount: number;
  filter: FilterStats;
  places: MapPlace[];
}> {
  const fetchCount = oversampleCount(opts.parsed.targetCount);
  const rawPlaces = await searchGoogleMaps({
    token: opts.token,
    actorId: opts.actorId,
    businessType: opts.parsed.businessType,
    city: opts.parsed.city,
    maxPlaces: fetchCount,
    websitePreference: opts.parsed.websitePreference,
  });
  const filter = filterPlaces(rawPlaces, opts.parsed);
  // #region agent log
  fetch('http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9903e8'},body:JSON.stringify({sessionId:'9903e8',runId:'pre-fix',hypothesisId:'D',location:'lib/finder/workflows/findListings.ts:findListings',message:'filter outcome',data:{target:opts.parsed.targetCount,websitePreference:opts.parsed.websitePreference,maxReviews:opts.parsed.maxReviews,rawCount:rawPlaces.length,fetchCount,droppedReviews:filter.droppedReviews,droppedWebsite:filter.droppedWebsite,kept:filter.kept.length,keptWithWebsite:filter.kept.filter((p)=>Boolean(p.website)).length,sampleRawWebsites:rawPlaces.slice(0,8).map((p)=>({title:p.title,reviews:p.reviewsCount,hasWebsite:Boolean(p.website)}))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return {
    rawCount: rawPlaces.length,
    fetchCount,
    filter,
    places: filter.kept,
  };
}
