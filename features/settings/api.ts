export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveSettings, configStatus, maskSecret, SETTING_KEYS, type SettingKey } from "@/shared/settings";

export async function GET() {
  const cfg = await getConfig();
  const status = configStatus(cfg);
  const fields = Object.fromEntries(
    SETTING_KEYS.filter((key) => key !== "CRM_API_KEY").map((key) => [
      key,
      {
        configured: !!cfg[key],
        masked: maskSecret(cfg[key]),
      },
    ])
  );
  return NextResponse.json({ status, fields, timezone: cfg.CRM_TIMEZONE || "America/New_York" });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const patch: Partial<Record<SettingKey, string>> = {};
  for (const key of SETTING_KEYS) {
    if (typeof body[key] === "string") patch[key] = body[key];
  }
  const cfg = await saveSettings(patch);
  return NextResponse.json({
    ok: true,
    status: configStatus(cfg),
    message: configStatus(cfg).ready
      ? "Keys saved. Gemini + Telnyx are live — inbound replies will be handled automatically."
      : "Saved. Add Gemini, Telnyx API key, and Telnyx from-number to go live.",
  });
}
