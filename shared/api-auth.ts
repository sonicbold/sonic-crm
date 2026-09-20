import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getConfig, saveSettings } from "@/shared/settings";

export function generateCrmApiKey() {
  return `sonic_${randomBytes(32).toString("base64url")}`;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function keysEqual(a: string, b: string) {
  if (!a || !b) return false;
  return timingSafeEqual(digest(a), digest(b));
}

export function readApiKey(req: Request) {
  const header = req.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const x = req.headers.get("x-api-key")?.trim() || "";
  return bearer || x || "";
}

export async function requireAgentKey(req: Request) {
  const cfg = await getConfig();
  if (!cfg.CRM_API_KEY) {
    return NextResponse.json(
      { error: "No CRM API key yet. Open Settings and click Generate agent API key." },
      { status: 503 }
    );
  }
  const provided = readApiKey(req);
  if (!provided || !keysEqual(provided, cfg.CRM_API_KEY)) {
    return NextResponse.json(
      { error: "Invalid or missing API key. Send Authorization: Bearer <key> or X-API-Key." },
      { status: 401 }
    );
  }
  return null;
}

export async function rotateCrmApiKey() {
  const key = generateCrmApiKey();
  await saveSettings({ CRM_API_KEY: key });
  return key;
}
