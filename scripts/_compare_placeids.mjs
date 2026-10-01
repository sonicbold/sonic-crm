import { PrismaClient } from "@prisma/client";
import { ApifyClient } from "apify-client";

const prisma = new PrismaClient();
const searches = await prisma.mapSearch.findMany({
  where: { location: { contains: "vegas" } },
});
console.log(
  "vegas searches",
  searches.map((s) => ({ q: s.query, loc: s.location, n: s.resultCount })),
);

const wanted = [
  "P1 PLUMBING",
  "Red Carpet",
  "AquaFlow",
  "High Noon",
  "Uncle E",
  "In House",
  "Vegas Built",
  "Cobra Plumbing",
];
for (const s of searches) {
  const places = JSON.parse(s.placesJson);
  for (const p of places) {
    if (wanted.some((w) => String(p.title).includes(w))) {
      console.log({
        query: s.query,
        title: p.title,
        placeId: p.placeId,
        url: String(p.url || "").slice(0, 80),
      });
    }
  }
}

const token = (await prisma.appSetting.findUnique({ where: { key: "APIFY_API_TOKEN" } })).value.trim();
await prisma.$disconnect();
const client = new ApifyClient({ token });
const { items } = await client.dataset("9hXs0J5z2A07uRXjI").listItems({ limit: 10000 });
const pids = [...new Set(items.map((i) => i.place?.placeId).filter(Boolean))];
console.log("review pids", pids);
