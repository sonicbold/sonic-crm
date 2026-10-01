import type { MapSearch } from "@/features/finder/filter";
import type { MapPlace } from "@/features/finder/types";
import { logger } from "@/shared/log";
import { prisma } from "@/shared/db";

const log = logger("finder.cache");

let tableReady: Promise<void> | null = null;

function ensureTable() {
  tableReady ??= prisma
    .$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "MapSearch" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "query" TEXT NOT NULL,
        "location" TEXT NOT NULL,
        "exhaustive" BOOLEAN NOT NULL DEFAULT false,
        "resultCount" INTEGER NOT NULL DEFAULT 0,
        "placesJson" TEXT NOT NULL,
        "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .then(() =>
      prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "MapSearch_query_location_key" ON "MapSearch"("query", "location")`,
      ),
    )
    .then(() => undefined);
  return tableReady;
}

function searchKey(search: Pick<MapSearch, "query" | "location">) {
  return {
    query: search.query.trim().toLowerCase(),
    location: search.location.trim().toLowerCase(),
  };
}

function readPlaces(raw: string): MapPlace[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((row): row is MapPlace => Boolean(row) && typeof row === "object" && "title" in row);
}

/** Places from a Maps search we already paid for. Null means this query has not been saved. */
export async function recallMapSearch(search: Pick<MapSearch, "query" | "location">): Promise<MapPlace[] | null> {
  try {
    await ensureTable();
    const key = searchKey(search);
    const row = await prisma.mapSearch.findUnique({
      where: { query_location: key },
    });
    if (!row) return null;
    return readPlaces(row.placesJson);
  } catch (err) {
    log.warn("saved Maps search could not be read", { err, query: search.query, location: search.location });
    return null;
  }
}

/** Keep every listing from a paid Maps call so the next run in this city does not buy it again. */
export async function rememberMapSearch(search: MapSearch, places: MapPlace[]): Promise<void> {
  try {
    await ensureTable();
    const key = searchKey(search);
    const placesJson = JSON.stringify(places);
    await prisma.mapSearch.upsert({
      where: { query_location: key },
      create: {
        ...key,
        exhaustive: search.exhaustive,
        resultCount: places.length,
        placesJson,
      },
      update: {
        exhaustive: search.exhaustive,
        resultCount: places.length,
        placesJson,
        searchedAt: new Date(),
      },
    });
  } catch (err) {
    log.warn("saved Maps search could not be stored", { err, query: search.query, location: search.location });
  }
}
