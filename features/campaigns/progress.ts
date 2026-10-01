export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCampaignProgress } from "@/features/campaigns/drip-runner";
import { jsonError } from "@/shared/route";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("campaigns.progress", "id required", 400);
  const progress = await getCampaignProgress(id);
  if (!progress) return jsonError("campaigns.progress", "Campaign not found", 404);
  return NextResponse.json(progress);
}
