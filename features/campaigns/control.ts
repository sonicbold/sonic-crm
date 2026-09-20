export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { reschedulePending, getCampaignProgress } from "@/features/campaigns/drip-runner";
import { campaignTimezone, nextWindowOpen } from "@/features/campaigns/drip-schedule";

export async function POST(req: NextRequest) {
  const { id, action } = await req.json();
  if (!id || !action) return NextResponse.json({ error: "id and action required" }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (action === "pause") {
    await prisma.campaign.update({ where: { id }, data: { status: "paused" } });
  } else if (action === "resume") {
    if (campaign.status === "stopped") {
      return NextResponse.json({ error: "Stopped campaigns cannot be resumed." }, { status: 400 });
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
    return NextResponse.json({ error: "action must be pause, resume, or stop" }, { status: 400 });
  }

  const progress = await getCampaignProgress(id);
  return NextResponse.json({ ok: true, progress });
}
