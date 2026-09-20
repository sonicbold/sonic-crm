import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { parseCampaignMessage } from "@/shared/utils";
import { reschedulePending, getCampaignProgress } from "@/features/campaigns/drip-runner";
import { campaignTimezone, describePlan } from "@/features/campaigns/drip-schedule";
import { getConfig } from "@/shared/settings";

export async function POST(req: NextRequest) {
  const { campaignId, leadIds, count } = await req.json();
  if (!campaignId || !leadIds?.length) {
    return NextResponse.json({ error: "campaignId and leadIds required" }, { status: 400 });
  }
  const cfg = await getConfig();
  if (!cfg.TELNYX_API_KEY || !cfg.TELNYX_PHONE_NUMBER) {
    return NextResponse.json({ error: "Telnyx is not configured. Paste keys in Settings." }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status === "stopped") {
    return NextResponse.json({ error: "This campaign was stopped. Create a new one." }, { status: 400 });
  }

  const template = parseCampaignMessage(campaign.steps);
  if (!template) return NextResponse.json({ error: "Campaign has no message" }, { status: 400 });

  const target = Math.min(Math.max(1, Number(count) || leadIds.length), leadIds.length);
  const picked = leadIds.slice(0, target);
  const queuedIds: string[] = [];

  for (const leadId of picked) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { campaignLeads: true },
    });
    if (!lead?.phone) continue;
    if (lead.campaignLeads && lead.campaignLeads.length > 0) continue;
    if (lead.status !== "new") continue;

    await prisma.campaignLead.create({
      data: { campaignId, leadId, status: "queued", currentStep: 0 },
    });
    queuedIds.push(leadId);
  }

  if (!queuedIds.length) {
    return NextResponse.json({ error: "No eligible new leads to queue. Each lead can only be enrolled once." }, { status: 400 });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "active", targetCount: queuedIds.length },
  });

  const { times } = await reschedulePending(campaignId, new Date());
  const tz = campaignTimezone();
  const plan = describePlan(times, tz);
  const progress = await getCampaignProgress(campaignId);

  return NextResponse.json({
    enrolled: queuedIds.length,
    requested: target,
    plan,
    progress,
  });
}
