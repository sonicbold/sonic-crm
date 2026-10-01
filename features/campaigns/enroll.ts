import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { parseCampaignMessages } from "@/shared/utils";
import { reschedulePending, getCampaignProgress } from "@/features/campaigns/drip-runner";
import { campaignTimezone, describePlan } from "@/features/campaigns/drip-schedule";
import { getConfig } from "@/shared/settings";
import { jsonError } from "@/shared/route";

type Enrollment = { campaignId: string; status: string };

function skipReason(
  lead: {
    phone: string | null;
    archived: boolean;
    status: string;
    campaignLeads: Enrollment[];
  } | null,
  campaignId: string,
): string | null {
  if (!lead?.phone) return "no phone";
  if (lead.archived) return "archived";
  if (lead.status === "not_interested" || lead.status === "closed") return "do not contact";
  if (lead.campaignLeads.some((e) => e.campaignId === campaignId)) return "already in this campaign";
  if (lead.campaignLeads.some((e) => e.status === "queued" || e.status === "scheduled")) {
    return "already in an active drip";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { campaignId, leadIds, count } = await req.json();
  if (!campaignId || !leadIds?.length) {
    return jsonError("campaigns.enroll", "Select at least one lead to text.", 400);
  }
  const cfg = await getConfig();
  if (!cfg.TELNYX_API_KEY || !cfg.TELNYX_PHONE_NUMBER) {
    return jsonError("campaigns.enroll", "Telnyx is not configured. Paste keys in Settings.", 400);
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return jsonError("campaigns.enroll", "Campaign not found", 404);
  if (campaign.status === "stopped") {
    return jsonError("campaigns.enroll", "This campaign was stopped. Create a new one.", 400);
  }

  const templates = parseCampaignMessages(campaign.steps);
  if (!templates.length) return jsonError("campaigns.enroll", "Campaign has no message", 400);

  const uniqueIds = [...new Set((leadIds as string[]).filter(Boolean))];
  const target = Math.min(Math.max(1, Number(count) || uniqueIds.length), uniqueIds.length);
  const picked = uniqueIds.slice(0, target);
  const queuedIds: string[] = [];
  const skipped: string[] = [];

  for (let index = 0; index < picked.length; index++) {
    const leadId = picked[index];
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { campaignLeads: { select: { campaignId: true, status: true } } },
    });
    const reason = skipReason(lead, campaignId);
    if (reason) {
      skipped.push(reason);
      continue;
    }

    await prisma.campaignLead.create({
      data: {
        campaignId,
        leadId,
        status: "queued",
        currentStep: 0,
        variant: templates.length > 1 ? index % 2 : 0,
      },
    });
    queuedIds.push(leadId);
  }

  if (!queuedIds.length) {
    const hint = skipped[0] ? ` (${skipped[0]})` : "";
    return jsonError("campaigns.enroll", `No eligible leads to queue${hint}. Uncheck people already in a drip.`, 400);
  }

  const total = await prisma.campaignLead.count({ where: { campaignId } });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: campaign.status === "paused" ? "paused" : "active",
      targetCount: total,
    },
  });

  const { times } = await reschedulePending(campaignId, new Date());
  const tz = campaignTimezone();
  const plan = describePlan(times, tz);
  const progress = await getCampaignProgress(campaignId);

  return NextResponse.json({
    enrolled: queuedIds.length,
    skipped: skipped.length,
    requested: target,
    plan,
    progress,
  });
}
