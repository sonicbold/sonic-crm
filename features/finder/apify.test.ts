import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewsFromItems } from "./apify";
import type { MapPlace } from "./types";

const place: MapPlace = {
  title: "Vegas Built Plumbing",
  phone: "7025550100",
  address: "Las Vegas, NV",
  website: null,
  reviewsCount: 40,
  rating: 4.8,
  url: "https://maps.google.com/?cid=1",
  placeId: "ChIJeSxONfCE6goRrKZJlFX4m4w",
};

test("reviewsFromItems matches Kaix nested place.placeId and skips empty text", () => {
  const items = [
    {
      place: { name: "Vegas Built Plumbing", placeId: "ChIJeSxONfCE6goRrKZJlFX4m4w" },
      text: "",
      author: { name: "Ann" },
      rating: 5,
    },
    {
      place: { name: "Vegas Built Plumbing", placeId: "ChIJeSxONfCE6goRrKZJlFX4m4w" },
      text: "Mike came out the same day.",
      ownerResponse: { text: "Thanks, Mike" },
      author: { name: "Bob" },
      rating: 5,
    },
    {
      place: { name: "Other Shop", placeId: "ChIJother" },
      text: "Wrong shop",
      author: { name: "Cal" },
      rating: 5,
    },
  ];
  const reviews = reviewsFromItems(items, place);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.text, "Mike came out the same day.");
  assert.equal(reviews[0]?.ownerReply, "Thanks, Mike");
});

test("reviewsFromItems does not treat the reviewer byline as the shop name", () => {
  const items = [
    {
      name: "Ann the reviewer",
      text: "Great work",
      author: { name: "Ann the reviewer" },
      rating: 5,
    },
  ];
  assert.equal(reviewsFromItems(items, place).length, 0);
});
