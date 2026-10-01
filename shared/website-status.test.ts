import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyWebsite, websiteDedupKey } from "./website-status";

test("blank and explicit missing values are No Website", () => {
  for (const raw of [null, "", "  ", "No link", "no website", "N/A", "none"]) {
    const result = classifyWebsite(raw);
    assert.equal(result.websiteStatus, "no_website");
    assert.equal(result.website, null);
  }
});

test("a real business domain is Has Website and stores a verified URL", () => {
  const result = classifyWebsite("HTTP://WWW.JoesPlumbing.com/services?utm_source=maps");
  assert.equal(result.websiteStatus, "has_website");
  assert.equal(result.website, "https://joesplumbing.com/services");
});

test("site builders count as a business website", () => {
  assert.equal(classifyWebsite("joes.wixsite.com/plumbing").websiteStatus, "has_website");
  assert.equal(classifyWebsite("https://sites.google.com/view/joes-plumbing").websiteStatus, "has_website");
});

test("maps, social, and directory links are not a legitimate website", () => {
  for (const raw of [
    "https://www.google.com/maps/place/Joe",
    "https://maps.app.goo.gl/abc",
    "https://facebook.com/joesplumbing",
    "https://www.yelp.com/biz/joes-plumbing",
    "https://g.page/joes",
  ]) {
    const result = classifyWebsite(raw);
    assert.equal(result.websiteStatus, "no_website", raw);
    assert.equal(result.website, null);
  }
});

test("websiteDedupKey matches www and https to the same host", () => {
  assert.equal(websiteDedupKey("https://www.JoesPlumbing.com/about"), "joesplumbing.com");
  assert.equal(websiteDedupKey("http://joesplumbing.com"), "joesplumbing.com");
  assert.equal(websiteDedupKey("https://facebook.com/joesplumbing"), null);
  assert.equal(websiteDedupKey("No link"), null);
});

test("short links and junk values stay Uncertain", () => {
  const short = classifyWebsite("https://bit.ly/joes");
  assert.equal(short.websiteStatus, "uncertain");
  assert.equal(short.website, "https://bit.ly/joes");

  const junk = classifyWebsite("not a website");
  assert.equal(junk.websiteStatus, "uncertain");
  assert.equal(junk.website, null);

  const email = classifyWebsite("mike@joesplumbing.com");
  assert.equal(email.websiteStatus, "uncertain");
  assert.equal(email.website, null);
});
