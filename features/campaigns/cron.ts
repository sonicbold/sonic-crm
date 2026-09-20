export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { processDueSends } from "@/features/campaigns/drip-runner";

export async function GET() {
  try {
    const result = await processDueSends(1);
    return NextResponse.json({ ok: true, ...result, ts: new Date().toISOString() });
  } catch (err) {
    console.error("Drip processor error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "processor failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
