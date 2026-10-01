import assert from "node:assert/strict";
import { test } from "node:test";
import { emptySessionMix, formatSessionMixLog, sessionPercents } from "./session-stats";

test("sessionPercents is named over shops with review text and website over saved leads", () => {
  const mix = emptySessionMix();
  assert.deepEqual(sessionPercents(mix), { nameRatePct: 0, websitePct: 0, noWebsitePct: 0, leads: 0 });
  mix.named = 3;
  mix.withReviews = 4;
  mix.withWebsite = 1;
  mix.noWebsite = 3;
  assert.equal(sessionPercents(mix).nameRatePct, 75);
  assert.equal(sessionPercents(mix).websitePct, 25);
  assert.equal(sessionPercents(mix).noWebsitePct, 75);
  assert.match(formatSessionMixLog(mix), /75%/);
});
