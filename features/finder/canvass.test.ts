import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldContinueAfterBatch, shouldMarkCityDone } from "./canvass";

test("a batch cap does not close the city", () => {
  assert.equal(shouldMarkCityDone({ stopped: false, hitLeadCap: true }), false);
  assert.equal(shouldMarkCityDone({ stopped: false, hitLeadCap: false }), true);
  assert.equal(shouldMarkCityDone({ stopped: true, hitLeadCap: false }), false);
});

test("the next 10-lead batch starts after a full cap unless the user stopped", () => {
  assert.equal(
    shouldContinueAfterBatch({
      leadCap: 10,
      hitLeadCap: true,
      paused: false,
      error: null,
      leadCount: 10,
    }),
    true,
  );
  assert.equal(
    shouldContinueAfterBatch({
      leadCap: 10,
      hitLeadCap: true,
      paused: true,
      error: null,
      leadCount: 10,
    }),
    false,
  );
  assert.equal(
    shouldContinueAfterBatch({
      leadCap: null,
      hitLeadCap: false,
      paused: false,
      error: null,
      leadCount: 40,
    }),
    false,
  );
  assert.equal(
    shouldContinueAfterBatch({
      leadCap: 10,
      hitLeadCap: false,
      paused: false,
      error: null,
      leadCount: 3,
    }),
    false,
  );
});
