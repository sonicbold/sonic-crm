export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { processDueSends } from "@/features/campaigns/drip-runner";

export async function GET() {
  const result = await processDueSends(1);
  return NextResponse.json({ ok: true, ...result, ts: new Date().toISOString() });
}

export async function POST() {
  return GET();
}
