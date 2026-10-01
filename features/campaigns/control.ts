export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { reschedulePending, getCampaignProgress } from "@/features/campaigns/drip-runner";
import { campaignTimezone, nextWindowOpen } from "@/features/campaigns/drip-schedule";
import { jsonError } from "@/shared/route";

export async function POST(req: NextRequest) {
  const { id, action } = await req.json();
  if (!id || !action) return jsonError("campaigns.control", "id and action required", 400);

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return jsonError("campaigns.control", "Campaign not found", 404);

  if (action === "pause") {
    await prisma.campaign.update({ where: { id }, data: { status: "paused" } });
  } else if (action === "resume") {
    if (campaign.status === "stopped") {
      return jsonError("campaigns.control", "Stopped campaigns cannot be resumed.", 400);
    }
    await prisma.campaign.update({ where: { id }, data: { status: "active" } });
    await reschedulePending(id, nextWindowOpen(new Date(), campaignTimezone()));
  } else if (action === "stop") {
    await prisma.campaign.update({ where: { id }, data: { status: "stopped" } });
    await prisma.campaignLead.updateMany({
      where: { campaignId: id, status: { in: ["queued", "scheduled"] } },
      data: { status: "cancelled", nextSendAt: null },
    });
  } else {
    return jsonError("campaigns.control", "action must be pause, resume, or stop", 400);
  }

  const progress = await getCampaignProgress(id);
  return NextResponse.json({ ok: true, progress });
}
