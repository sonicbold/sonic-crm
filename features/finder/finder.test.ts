import assert from "node:assert/strict";
import { test } from "node:test";
import { CANVASS, leadCap } from "./canvass";
import { parseCheckpoint } from "./checkpoint";
import { filterPlaces, mapSearchPlan, mapsQueryVariants, oversampleCount } from "./filter";
import { parseRequestLocally } from "./gemini";
import { applyPlumberNiche, isChainListing, isPlumberListing, rankMarkets, searchedCityKeys } from "./niche";
import { isFinderStopped, FinderStopped } from "./stop";
import { isQualityLead, isTollFreePhone, isUsableLead, listingOwner, phoneKey, placeDedupKey, usableListedOwner } from "./valid";
import { crmLeadsToCsv } from "./csv";
import { estimateCost, emptySpend } from "./spend";
import type { Lead, MapPlace } from "./types";

function place(partial: Partial<MapPlace> & { title: string }): MapPlace {
  return {
    phone: "7135550100",
    address: "Houston, TX",
    website: null,
    reviewsCount: 10,
    rating: 4,
    url: "",
    placeId: partial.title,
    ...partial,
  };
}

test("filterPlaces keeps every match and does not stop at targetCount", () => {
  const places = Array.from({ length: 12 }, (_, i) =>
    place({ title: `Shop ${i} Plumbing`, category: "Plumber", reviewsCount: i, website: i % 2 === 0 ? null : "https://ex.com" }),
  );
  const result = filterPlaces(places, {
    businessType: "plumbers",
    city: "Houston, TX",
    minReviews: null,
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
  assert.equal(oversampleCount(1000), CANVASS.mapsBatchCap);
});

test("mapSearchPlan is exhaustive plumbers plus drain cleaning and water heater installation", () => {
  const plan = mapSearchPlan("Houston, TX", "plumbers");
  assert.equal(plan.length, CANVASS.maxMapCalls);
  assert.deepEqual(
    plan.map((step) => step.query),
    ["plumbers", "drain cleaning service", "water heater installation"],
  );
  assert.equal(plan[0].location, "Houston, TX");
  assert.equal(plan[0].exhaustive, true);
  assert.equal(plan[1].exhaustive, false);
  assert.equal(plan[2].exhaustive, false);
  assert.equal(plan.some((step) => step.location === "north Houston, TX"), false);
  assert.equal(plan.some((step) => /contractor/i.test(step.query)), false);
});

test("mapsQueryVariants stays inside plumbing searches", () => {
  const variants = mapsQueryVariants("plumbers");
  assert.equal(variants[0], "plumbers");
  assert.ok(variants.includes("drain cleaning service"));
  assert.ok(variants.includes("water heater repair"));
  assert.equal(variants.some((q) => /contractor/i.test(q)), false);
});

test("filterPlaces keeps 30 to 149 plumbing businesses with at least 3 stars", () => {
  const result = filterPlaces(
    [
      place({ title: "Joe's Plumbing", reviewsCount: 30, rating: 3, category: "Plumber", website: "https://joe.example" }),
      place({ title: "New Shop", reviewsCount: 29, rating: 4, category: "Plumber" }),
      place({ title: "Big Co", reviewsCount: 150, rating: 5, category: "Plumber" }),
      place({ title: "Mid Shop", reviewsCount: 149, rating: 4.2, category: "Plumber" }),
      place({ title: "Low Stars", reviewsCount: 40, rating: 2.9, category: "Plumber" }),
      place({ title: "Houston Plumbing Supply", reviewsCount: 40, rating: 4, category: "Plumber" }),
      place({ title: "Ace Hardware", reviewsCount: 40, rating: 4, category: "Hardware store" }),
    ],
    {
      businessType: "plumbers",
      city: "Houston, TX",
      minReviews: 30,
      maxReviews: 150,
      websitePreference: "any",
      targetCount: 25,
    },
  );
  assert.deepEqual(
    result.kept.map((row) => row.title),
    ["Joe's Plumbing", "Mid Shop"],
  );
  assert.equal(result.droppedBelowMin, 1);
  assert.equal(result.droppedReviews, 1);
  assert.equal(result.droppedLowRating, 1);
  assert.equal(result.droppedOffNiche, 2);
  assert.equal(result.droppedWebsite, 0);
});

test("applyPlumberNiche locks plumbing, 30 to 149 reviews, and both website cases", () => {
  const parsed = applyPlumberNiche({
    businessType: "roofers",
    city: "Dallas, TX",
    minReviews: null,
    maxReviews: null,
    websitePreference: "without",
    targetCount: 25,
  });
  assert.equal(parsed.businessType, "plumbers");
  assert.equal(parsed.minReviews, 30);
  assert.equal(parsed.maxReviews, 150);
  assert.equal(parsed.websitePreference, "any");
  assert.equal(parsed.city, "Dallas, TX");
});

test("applyPlumberNiche ignores a tighter prompt cap", () => {
  const parsed = applyPlumberNiche(
    parseRequestLocally("Find 10 plumbers in Austin, TX under 40 reviews"),
  );
  assert.equal(parsed.minReviews, 30);
  assert.equal(parsed.maxReviews, 150);
  assert.equal(parsed.websitePreference, "any");
});

test("local parser keeps large target counts", () => {
  const parsed = parseRequestLocally("Find 1000 plumbers in Houston, TX under 150 reviews, with no website");
  assert.equal(parsed.targetCount, 1000);
  assert.match(parsed.city, /Houston/i);
  assert.equal(parsed.websitePreference, "without");
  assert.equal(parsed.maxReviews, 150);
});

test("isUsableLead keeps a phone even when the summary fails", () => {
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
    rating: 4.6,
  };
  assert.equal(isUsableLead(ok), true);
  assert.equal(isUsableLead({ ...ok, phone: "Not listed" }), false);
  assert.equal(
    isUsableLead({
      ...ok,
      summary: "Reviews were found, but the summary step failed.",
      note: "Summary skipped: 429",
    }),
    true,
  );
});

test("a search that covers several cities counts each city, including one with no leads", () => {
  assert.deepEqual(searchedCityKeys("Albuquerque, NM · Boise, ID"), ["Albuquerque, NM", "Boise, ID"]);
  const ranked = rankMarkets([
    { city: "Albuquerque, NM", leads: 0, lastSearchedAt: 100 },
    { city: "Boise, ID", leads: 0, lastSearchedAt: 0 },
  ]);
  assert.equal(ranked[0].city, "Boise, ID");
});

test("rankMarkets starts with the city that has the fewest saved leads", () => {
  const ranked = rankMarkets([
    { city: "Dallas, TX", leads: 10, lastSearchedAt: 1 },
    { city: "Houston, TX", leads: 0, lastSearchedAt: 5 },
    { city: "Austin, TX", leads: 0, lastSearchedAt: 1 },
  ]);
  assert.deepEqual(
    ranked.map((row) => row.city),
    ["Austin, TX", "Houston, TX", "Dallas, TX"],
  );
});

test("isPlumberListing keeps plumbers and drops other trades, even with no category", () => {
  assert.equal(isPlumberListing({ title: "Joe's Plumbing" }), true);
  assert.equal(isPlumberListing({ title: "Joe's Electric" }), false);
  assert.equal(isPlumberListing({ title: "Piper Heating", category: "HVAC contractor" }), false);
  assert.equal(isPlumberListing({ title: "City Pipe Works", category: "Plumber" }), true);
});

test("isQualityLead counts a callable plumber and skips chains", () => {
  const ok: Lead = {
    index: 1,
    ownerName: "Pat Lee",
    businessName: "Pat Plumbing",
    phone: "(713) 555-0199",
    location: "Houston",
    website: "No link",
    profileUrl: "https://maps.google.com/?cid=1",
    summary: "Great work.",
    reviewsCount: 40,
    rating: 4.6,
  };
  assert.equal(isQualityLead(ok), true);
  assert.equal(isQualityLead({ ...ok, ownerName: "Owner name not found" }), true);
  assert.equal(isQualityLead({ ...ok, phone: "Not listed" }), false);
  assert.equal(isQualityLead({ ...ok, businessName: "Roto-Rooter" }), false);
  assert.equal(isChainListing("Mr. Rooter Plumbing"), true);
});

test("usableListedOwner keeps a person and skips the business name", () => {
  assert.equal(usableListedOwner("Mike Torres", "Torres Plumbing"), "Mike Torres");
  assert.equal(usableListedOwner("Torres Plumbing LLC", "Torres Plumbing"), null);
  assert.equal(usableListedOwner("Owner", "Torres Plumbing"), null);
  assert.equal(usableListedOwner("Lion", "Lion Plumbing, Inc."), null);
  assert.equal(usableListedOwner("Atlas", "Atlas Plumbing of Hollywood"), null);
  assert.equal(usableListedOwner("Bob", "Bob's Plumbing Co"), "Bob");
});

test("listingOwner keeps a real Maps-listed person and never reads the shop title", () => {
  assert.equal(listingOwner({ title: "Metro Pro Plumbing", listedOwnerName: "Mike Torres" }), "Mike Torres");
  assert.equal(listingOwner({ title: "Joe's Plumbing" }), null);
  assert.equal(listingOwner({ title: "Pat Lee Plumbing" }), null);
  assert.equal(listingOwner({ title: "Michalek Plumbing" }), null);
  assert.equal(listingOwner({ title: "Johnny Rooter Plumbing" }), null);
  assert.equal(listingOwner({ title: "City Plumbing" }), null);
  assert.equal(listingOwner({ title: "Metro Pro Plumbing", listedOwnerName: "City Plumbing" }), null);
});

test("isFinderStopped recognizes a cancelled run", () => {
  assert.equal(isFinderStopped(new FinderStopped()), true);
  assert.equal(isFinderStopped(new Error("Apify run FAILED.")), false);
});

test("placeDedupKey prefers placeId then phone", () => {
  assert.equal(placeDedupKey(place({ title: "A", placeId: "abc" })), "pid:abc");
  assert.equal(phoneKey("(713) 555-0100"), "7135550100");
  assert.equal(phoneKey("+1 (713) 555-0100"), phoneKey("7135550100"));
});

test("toll-free numbers are not callable shop lines", () => {
  const row: Lead = {
    index: 1,
    ownerName: "Pat Lee",
    businessName: "Pat Plumbing",
    phone: "(713) 555-0199",
    location: "Houston",
    website: "No link",
    profileUrl: "https://maps.google.com/?cid=1",
    summary: "Great work.",
    reviewsCount: 40,
    rating: 4.6,
  };
  for (const phone of ["800-555-0199", "+1 (888) 555-0100", "1-877-555-0133", "8665550144", "8555550155", "8445550166", "8335550177"]) {
    assert.equal(isTollFreePhone(phone), true, phone);
    assert.equal(isUsableLead({ ...row, phone }), false, phone);
  }
  assert.equal(isTollFreePhone("7135550100"), false);
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

test("estimateCost prices billed Maps rows and OpenRouter tokens", () => {
  const spend = emptySpend();
  spend.mapsPaidResults = 1000;
  spend.reviewResults = 1000;
  spend.openrouterPromptTokens = 1_000_000;
  spend.openrouterCompletionTokens = 1_000_000;
  spend.newLeads = 10;
  const cost = estimateCost(spend);
  assert.equal(cost.apifyUsd, 9);
  assert.equal(cost.openrouterUsd, 0.18);
  assert.equal(Number(cost.costPerLeadUsd?.toFixed(3)), 0.918);
});

test("leadCap reads FINDER_LEAD_CAP and ignores a missing value", () => {
  const prev = process.env.FINDER_LEAD_CAP;
  process.env.FINDER_LEAD_CAP = "10";
  assert.equal(leadCap(), 10);
  delete process.env.FINDER_LEAD_CAP;
  assert.equal(leadCap(), null);
  if (prev !== undefined) process.env.FINDER_LEAD_CAP = prev;
});

test("parseCheckpoint keeps the city and next Maps query", () => {
  const parsed = parseCheckpoint(
    JSON.stringify({ status: "paused", city: "Dallas, TX", queryIndex: 2, citiesDone: ["Houston, TX"], jobId: "job1" }),
  );
  assert.equal(parsed?.city, "Dallas, TX");
  assert.equal(parsed?.queryIndex, 2);
  assert.deepEqual(parsed?.citiesDone, ["Houston, TX"]);
  assert.equal(parseCheckpoint("{}"), null);
});
