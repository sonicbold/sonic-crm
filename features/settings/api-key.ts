export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getConfig, maskSecret } from "@/shared/settings";
import { rotateCrmApiKey } from "@/shared/api-auth";

export async function GET() {
  const cfg = await getConfig();
  return NextResponse.json({
    configured: !!cfg.CRM_API_KEY,
    masked: maskSecret(cfg.CRM_API_KEY),
  });
}

export async function POST() {
  const key = await rotateCrmApiKey();
  return NextResponse.json({
    ok: true,
    key,
    message: "Copy this key now. It will not be shown in full again. Use Authorization: Bearer <key> on /api/v1.",
    basePath: "/api/v1",
  });
}
