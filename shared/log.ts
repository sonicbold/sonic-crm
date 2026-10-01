/** Feature-scoped logs. Set SONIC_DEBUG=1 or SONIC_DEBUG=finder,leads to see debug lines. */

import { requestContext } from "@/shared/request-context";

type Fields = Record<string, unknown>;

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogLine = {
  t: string;
  level: LogLevel;
  feature: string;
  message: string;
  [key: string]: unknown;
};

const SECRET_KEY = /(api[_-]?key|token|secret|password|authorization|auth|bearer)$/i;
const SECRET_NAME = /gemini|groq|apify|telnyx_api|crm_api|anon_key|service_role/i;
const SKIP_REDACT = new Set(["error", "stack", "message", "feature", "t", "level", "path", "method", "status", "ms", "requestId", "runId", "step"]);

export function debugEnabled(feature: string): boolean {
  const flag = (process.env.SONIC_DEBUG || "").trim();
  if (!flag) return false;
  if (flag === "1" || flag === "true" || flag === "*") return true;
  return flag
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .some((name) => feature === name || feature.startsWith(`${name}.`));
}

export function redactFields(fields: Fields, depth = 0): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SKIP_REDACT.has(key)) {
      out[key] = value;
      continue;
    }
    if (SECRET_KEY.test(key) || SECRET_NAME.test(key)) {
      out[key] = value ? "[redacted]" : value;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Error) && depth < 2) {
      out[key] = redactFields(value as Fields, depth + 1);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function formatLog(level: LogLevel, feature: string, message: string, fields?: Fields): LogLine {
  const extra = redactFields({ ...(fields || {}) });
  const err = extra.err;
  delete extra.err;

  const ctx = requestContext();
  if (ctx?.requestId && extra.requestId == null) extra.requestId = ctx.requestId;

  const line: LogLine = { t: new Date().toISOString(), level, feature, message, ...extra };
  if (err instanceof Error) {
    line.error = err.message;
    line.stack = err.stack;
  } else if (err != null) {
    line.error = String(err);
  }
  return line;
}

export function logger(feature: string, bound?: Fields) {
  const write = (level: LogLevel, message: string, fields?: Fields) => {
    if (level === "debug" && !debugEnabled(feature)) return;
    const line = JSON.stringify(formatLog(level, feature, message, { ...bound, ...fields }));
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };

  return {
    debug: (message: string, fields?: Fields) => write("debug", message, fields),
    info: (message: string, fields?: Fields) => write("info", message, fields),
    warn: (message: string, fields?: Fields) => write("warn", message, fields),
    error: (message: string, fields?: Fields) => write("error", message, fields),
    child: (extra: Fields) => logger(feature, { ...bound, ...extra }),
  };
}
