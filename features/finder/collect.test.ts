import assert from "node:assert/strict";
import { test } from "node:test";
import { collectValidLeads } from "./collect";
import type { AiRequestPool } from "./ai-pool";
import type { AppSettings, Lead, MapPlace, ParsedRequest, PipelineEvent } from "./types";

function settings(): AppSettings {
  return {
    GEMINI_API_KEY: "g",
    APIFY_API_TOKEN: "a",
    GROQ_API_KEY_1: "k1",
    GROQ_API_KEY_2: "k2",
    OPENROUTER_API_KEY: "or",
    APIFY_MAPS_ACTOR: "maps",
    APIFY_REVIEWS_ACTOR: "reviews",
    GEMINI_MODEL: "gemini",
    GROQ_MODEL: "groq",
    OPENROUTER_MODEL: "openrouter/free",
  };
}

function parsed(targetCount: number): ParsedRequest {
  return {
    businessType: "plumbers",
    city: "Houston, TX",
    maxReviews: 150,
    websitePreference: "without",
    targetCount,
  };
}

function place(id: string, phone: string): MapPlace {
  return {
    title: id,
    phone,
    address: "Houston, TX",
    website: null,
    reviewsCount: 12,
    url: `https://maps.google.com/?cid=${id}`,
    placeId: id,
  };
}

function leadFrom(placeRow: MapPlace, extra?: Partial<Lead>): Lead {
  return {
    index: 1,
    ownerName: "Owner",
    businessName: placeRow.title,
    phone: placeRow.phone,
    location: placeRow.address,
    website: "No link",
    profileUrl: placeRow.url,
    summary: "Solid reviews.",
    reviewsCount: placeRow.reviewsCount,
    ...extra,
  };
}

const fakePool = {
  setRemainingLeads() {},
} as unknown as AiRequestPool;

test("collectValidLeads keeps scraping until valid processed leads hit the target", async () => {
  const batches: MapPlace[][] = [
    [place("a", "7135550001"), place("b", "7135550002"), place("crm", "7135550999")],
    [place("c", "7135550003"), place("fail", "7135550004"), place("d", "7135550005")],
  ];
  let mapsCalls = 0;
  const events: PipelineEvent[] = [];

  const result = await collectValidLeads({
    parsed: parsed(3),
    settings: settings(),
    pool: fakePool,
    existingPhones: new Set(["7135550999"]),
    emit: (event) => events.push(event),
    activeProvider: () => "Groq Key 2",
    deps: {
      findListings: async () => {
        const places = batches[mapsCalls] ?? [];
        mapsCalls += 1;
        return {
          rawCount: places.length || 0,
          fetchCount: 50,
          query: "plumbers",
          filter: { kept: places, droppedReviews: 0, droppedWebsite: 0 },
          places,
        };
      },
      pullReviews: async ({ places }) => ({
        reviews: new Map(places.map((p) => [p.placeId, []])),
        warnings: [],
      }),
      enrichLeads: async ({ places, need, onValid }) => {
        const leads: Lead[] = [];
        for (const row of places) {
          if (leads.length >= need) break;
          if (row.title === "fail") {
            continue;
          }
          const item = leadFrom(row);
          leads.push(item);
          onValid?.(item, leads.length);
        }
        return { leads, attempted: leads, warnings: [] };
      },
    },
  });

  assert.ok(mapsCalls >= 2, "should request another Maps batch after the first valid count falls short");
  assert.equal(result.leads.length, 3);
  assert.deepEqual(
    result.leads.map((l) => l.businessName).sort(),
    ["a", "b", "c"],
  );
  assert.equal(
    result.leads.some((l) => l.phone.endsWith("0999")),
    false,
    "CRM duplicates must not count",
  );
  const statuses = events.filter((e) => e.type === "status");
  assert.ok(statuses.some((e) => e.type === "status" && e.validLeads === 3));
  assert.ok(statuses.some((e) => e.type === "status" && e.target === 3 && e.aiProvider === "Groq Key 2"));
});

test("collectValidLeads warns when Maps is exhausted before the target", async () => {
  const result = await collectValidLeads({
    parsed: parsed(5),
    settings: settings(),
    pool: fakePool,
    existingPhones: new Set(),
    emit: () => undefined,
    activeProvider: () => "waiting",
    deps: {
      findListings: async () => ({
        rawCount: 0,
        fetchCount: 50,
        query: "plumbers",
        filter: { kept: [], droppedReviews: 0, droppedWebsite: 0 },
        places: [],
      }),
      pullReviews: async () => ({ reviews: new Map(), warnings: [] }),
      enrichLeads: async () => ({ leads: [], attempted: [], warnings: [] }),
    },
  });
  assert.equal(result.leads.length, 0);
  assert.ok(result.warnings.some((w) => /ran out of new/i.test(w) || /Stopped with/i.test(w)));
});
