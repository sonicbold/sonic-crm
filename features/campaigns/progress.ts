export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCampaignProgress } from "@/features/campaigns/drip-runner";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const progress = await getCampaignProgress(id);
  if (!progress) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json(progress);
}
