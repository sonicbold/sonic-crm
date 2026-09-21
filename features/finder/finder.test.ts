import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPlaces, mapsQueryVariants, oversampleCount } from "./filter";
import { parseRequestLocally } from "./gemini";
import { isUsableLead, phoneKey, placeDedupKey } from "./valid";
import { crmLeadsToCsv } from "./csv";
import type { Lead, MapPlace } from "./types";

function place(partial: Partial<MapPlace> & { title: string }): MapPlace {
  return {
    phone: "7135550100",
    address: "Houston, TX",
    website: null,
    reviewsCount: 10,
    url: "",
    placeId: partial.title,
    ...partial,
  };
}

test("filterPlaces keeps every match and does not stop at targetCount", () => {
  const places = Array.from({ length: 12 }, (_, i) =>
    place({ title: `Shop ${i}`, reviewsCount: i, website: i % 2 === 0 ? null : "https://ex.com" }),
  );
  const result = filterPlaces(places, {
    businessType: "plumbers",
    city: "Houston, TX",
    maxReviews: 20,
    websitePreference: "without",
    targetCount: 3,
  });
  assert.equal(result.kept.length, 6);
  assert.ok(result.droppedWebsite >= 6);
});

test("oversampleCount grows with the target but stays inside one Maps batch", () => {
  assert.equal(oversampleCount(10), 50);
  assert.equal(oversampleCount(200), 400);
  assert.equal(oversampleCount(1000), 400);
});

test("mapsQueryVariants always starts with the original type", () => {
  const variants = mapsQueryVariants("plumbers");
  assert.equal(variants[0], "plumbers");
  assert.ok(variants.length > 1);
});

test("local parser keeps large target counts", () => {
  const parsed = parseRequestLocally("Find 1000 plumbers in Houston, TX under 150 reviews, with no website");
  assert.equal(parsed.targetCount, 1000);
  assert.match(parsed.city, /Houston/i);
  assert.equal(parsed.websitePreference, "without");
  assert.equal(parsed.maxReviews, 150);
});

test("isUsableLead rejects missing phones and AI failures", () => {
  const ok: Lead = {
    index: 1,
    ownerName: "Pat",
    businessName: "Pat Plumbing",
    phone: "(713) 555-0199",
    location: "Houston",
    website: "No link",
    profileUrl: "https://maps.google.com/?cid=1",
    summary: "Great work.",
    reviewsCount: 4,
  };
  assert.equal(isUsableLead(ok), true);
  assert.equal(isUsableLead({ ...ok, phone: "Not listed" }), false);
  assert.equal(
    isUsableLead({
      ...ok,
      summary: "Reviews were found, but the summary step failed.",
      note: "Summary skipped: 429",
    }),
    false,
  );
});

test("placeDedupKey prefers placeId then phone", () => {
  assert.equal(placeDedupKey(place({ title: "A", placeId: "abc" })), "pid:abc");
  assert.equal(phoneKey("(713) 555-0100"), "7135550100");
});

test("crmLeadsToCsv includes every CRM row", () => {
  const csv = crmLeadsToCsv([
    {
      name: "Pat",
      businessName: "Pat Plumbing",
      phone: "+17135550199",
      city: "Houston",
      state: "TX",
      source: "finder",
      status: "new",
      reviewCount: 4,
      createdAt: "2026-09-21T00:00:00.000Z",
    },
  ]);
  assert.ok(csv.includes("Pat Plumbing"));
  assert.ok(csv.includes("+17135550199"));
  assert.ok(csv.startsWith("Owner Name,Business Name,Phone"));
});
