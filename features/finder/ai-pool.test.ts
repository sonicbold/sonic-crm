import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AiRequestPool,
  RateLimitError,
  computeRequestDelay,
  nextUtcMidnight,
  parseRetryAfterMs,
  retryAfterFromMessage,
} from "./ai-pool";

function delayedResolve(value: string, ms = 0) {
  return async () => {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return value;
  };
}

test("parseRetryAfterMs treats small numbers as seconds", () => {
  assert.equal(parseRetryAfterMs("2"), 2000);
  assert.equal(parseRetryAfterMs("1.5"), 1500);
  assert.ok(parseRetryAfterMs("Retry") >= 1000);
});

test("retryAfterFromMessage reads Groq-style copy", () => {
  assert.equal(retryAfterFromMessage("Please try again in 2.5s"), 2500);
  assert.equal(retryAfterFromMessage("try again in 1m"), 60_000);
});

test("nextUtcMidnight is the following UTC day", () => {
  const now = Date.UTC(2026, 8, 21, 15, 0, 0);
  assert.equal(nextUtcMidnight(now), Date.UTC(2026, 8, 22));
});

test("computeRequestDelay stays at least minDelay and grows when RPM is tight", () => {
  const roomy = computeRequestDelay({
    minDelayMs: 400,
    remainingLeads: 10,
    providers: [
      { rpm: 30, usedInWindow: 0, paused: false },
      { rpm: 30, usedInWindow: 0, paused: false },
    ],
  });
  const tight = computeRequestDelay({
    minDelayMs: 400,
    remainingLeads: 200,
    providers: [{ rpm: 20, usedInWindow: 18, paused: false }],
  });
  assert.ok(roomy >= 400);
  assert.ok(tight >= roomy);
});

test("pool rotates to the second provider after a 429", async () => {
  const hits: string[] = [];
  const pool = new AiRequestPool({
    minDelayMs: 0,
    now: () => Date.now(),
    sleep: async () => undefined,
    providers: [
      {
        id: "groq-1",
        label: "Groq Key 1",
        family: "groq",
        rpm: 30,
        rpd: 1000,
        complete: async () => {
          hits.push("groq-1");
          throw new RateLimitError("rpm", { retryAfterMs: 60_000 });
        },
      },
      {
        id: "groq-2",
        label: "Groq Key 2",
        family: "groq",
        rpm: 30,
        rpd: 1000,
        complete: async () => {
          hits.push("groq-2");
          return "ok-from-2";
        },
      },
    ],
  });

  const result = await pool.complete({ system: "s", user: "u" });
  pool.stop();
  assert.equal(result.provider, "Groq Key 2");
  assert.equal(result.text, "ok-from-2");
  assert.ok(hits.includes("groq-1"));
  assert.ok(hits.includes("groq-2"));
});

test("pool waits out a per-key RPM window instead of failing the run", async () => {
  let now = 1_000_000;
  let calls = 0;
  const pool = new AiRequestPool({
    minDelayMs: 0,
    now: () => now,
    sleep: async (ms) => {
      now += Math.max(ms, 1);
    },
    providers: [
      {
        id: "groq-1",
        label: "Groq Key 1",
        family: "groq",
        rpm: 2,
        rpd: 1000,
        complete: async () => {
          calls += 1;
          return `ok-${calls}`;
        },
      },
    ],
  });

  const first = now;
  await pool.complete({ system: "s", user: "1" });
  await pool.complete({ system: "s", user: "2" });
  await pool.complete({ system: "s", user: "3" });
  pool.stop();
  assert.equal(calls, 3);
  assert.ok(now - first >= 50_000, `should wait for the RPM window, elapsed ${now - first}`);
});

test("pool reports the active provider on status callbacks", async () => {
  const seen: string[] = [];
  const pool = new AiRequestPool({
    minDelayMs: 0,
    sleep: async () => undefined,
    onStatus: (s) => seen.push(s.provider),
    providers: [
      {
        id: "openrouter",
        label: "OpenRouter",
        family: "openrouter",
        rpm: 20,
        rpd: 50,
        complete: delayedResolve("hi"),
      },
    ],
  });
  await pool.complete({ system: "s", user: "u" });
  pool.stop();
  assert.ok(seen.some((label) => label.includes("OpenRouter")));
});
