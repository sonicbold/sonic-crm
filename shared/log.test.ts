import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { debugEnabled, formatLog, logger, redactFields } from "./log";
import { guard, HttpError, jsonError } from "./route";
import { requestIdOf, runWithRequest } from "./request-context";

test("debug stays off until SONIC_DEBUG names the feature", () => {
  const previous = process.env.SONIC_DEBUG;
  delete process.env.SONIC_DEBUG;
  assert.equal(debugEnabled("finder.pipeline"), false);
  process.env.SONIC_DEBUG = "leads";
  assert.equal(debugEnabled("finder.pipeline"), false);
  assert.equal(debugEnabled("leads"), true);
  assert.equal(debugEnabled("leads.import"), true);
  process.env.SONIC_DEBUG = "*";
  assert.equal(debugEnabled("finder.pipeline"), true);
  if (previous == null) delete process.env.SONIC_DEBUG;
  else process.env.SONIC_DEBUG = previous;
});

test("error logs keep the stack and feature name", () => {
  const err = new Error("db down");
  const line = formatLog("error", "leads", "load failed", { err, path: "/api/leads" });
  assert.equal(line.feature, "leads");
  assert.equal(line.message, "load failed");
  assert.equal(line.error, "db down");
  assert.match(String(line.stack), /Error: db down/);
  assert.equal(line.path, "/api/leads");
  assert.equal("err" in line, false);
});

test("logs redact API keys and tokens", () => {
  const line = formatLog("error", "settings", "save failed", {
    GEMINI_API_KEY: "sk-live-secret",
    nested: { APIFY_API_TOKEN: "apify_xxx", city: "Dallas" },
    path: "/api/settings",
  });
  assert.equal(line.GEMINI_API_KEY, "[redacted]");
  assert.deepEqual(line.nested, { APIFY_API_TOKEN: "[redacted]", city: "Dallas" });
  assert.equal(line.path, "/api/settings");
  assert.equal(redactFields({ authorization: "Bearer abc" }).authorization, "[redacted]");
});

test("guard turns a thrown error into feature JSON and logs the stack", async () => {
  const previous = process.env.SONIC_DEBUG;
  delete process.env.SONIC_DEBUG;
  const lines: string[] = [];
  const original = console.error;
  console.error = (line?: unknown) => {
    lines.push(String(line));
  };
  try {
    const GET = guard("leads", async () => {
      throw new Error("db down");
    });
    const res = await GET(new NextRequest("http://localhost/api/leads", { headers: { "x-request-id": "req-leads-1" } }));
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-request-id"), "req-leads-1");
    assert.deepEqual(await res.json(), { error: "db down", feature: "leads", requestId: "req-leads-1" });
    const logged = JSON.parse(lines[0]);
    assert.equal(logged.feature, "leads");
    assert.equal(logged.path, "/api/leads");
    assert.equal(logged.requestId, "req-leads-1");
    assert.match(logged.stack, /db down/);
  } finally {
    console.error = original;
    if (previous == null) delete process.env.SONIC_DEBUG;
    else process.env.SONIC_DEBUG = previous;
  }
});

test("guard logs expected HttpError as a warning and keeps details", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line?: unknown) => {
    lines.push(String(line));
  };
  try {
    const POST = guard("campaigns", async () => {
      throw new HttpError("Name and message required", 400, { field: "name" });
    });
    const res = await POST(new NextRequest("http://localhost/api/campaigns", { method: "POST" }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Name and message required");
    assert.equal(body.feature, "campaigns");
    assert.deepEqual(body.details, { field: "name" });
    assert.equal(typeof body.requestId, "string");
    assert.equal(JSON.parse(lines[0]).level, "warn");
  } finally {
    console.error = original;
  }
});

test("guard passes a successful response through", async () => {
  const GET = guard("reports", async () => Response.json({ ok: true }));
  const res = await GET(new NextRequest("http://localhost/api/reports", { headers: { "x-request-id": "req-ok" } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("x-request-id"), "req-ok");
});

test("debug lines stay quiet unless SONIC_DEBUG is set", () => {
  const previous = process.env.SONIC_DEBUG;
  delete process.env.SONIC_DEBUG;
  const lines: string[] = [];
  const original = console.log;
  console.log = (line?: unknown) => {
    lines.push(String(line));
  };
  try {
    logger("finder").debug("quiet");
    assert.equal(lines.length, 0);
    process.env.SONIC_DEBUG = "finder";
    logger("finder.pipeline").debug("visible");
    assert.equal(JSON.parse(lines[0]).message, "visible");
  } finally {
    console.log = original;
    if (previous == null) delete process.env.SONIC_DEBUG;
    else process.env.SONIC_DEBUG = previous;
  }
});

test("jsonError names the feature and picks up the request id", async () => {
  const res = await runWithRequest({ requestId: "req-json", feature: "inbox.sms" }, () =>
    jsonError("inbox.sms", "leadId and message required", 400),
  );
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "leadId and message required",
    feature: "inbox.sms",
    requestId: "req-json",
  });
});

test("requestIdOf keeps a caller header", () => {
  const req = new NextRequest("http://localhost/api/leads", { headers: { "x-request-id": "from-client" } });
  assert.equal(requestIdOf(req), "from-client");
});
