import assert from "node:assert/strict";
import test from "node:test";
import { beginLiveRun, liveSnapshot, resetLiveRunForTests, stopFinderRun } from "./live-run";

test("a finder run stays on after the request that started it is done", async () => {
  resetLiveRunForTests();
  let released = false;
  const started = beginLiveRun(async ({ signal, emit }) => {
    emit({ type: "log", message: "searching" });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    released = signal.aborted;
  });
  assert.equal(started.ok, true);
  assert.equal(liveSnapshot().running, true);
  assert.equal(typeof liveSnapshot().runId, "string");
  assert.equal(liveSnapshot().events.some((event) => event.type === "log"), true);

  const again = beginLiveRun(async () => undefined);
  assert.equal(again.ok, false);

  assert.equal(stopFinderRun(), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(released, true);
  assert.equal(liveSnapshot().running, false);
  resetLiveRunForTests();
});
