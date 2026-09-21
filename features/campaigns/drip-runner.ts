import { prisma } from "@/shared/db";
import { sendSMS } from "@/features/inbox/telnyx";
import { interpolateMessage, ensureE164, parseCampaignMessages } from "@/shared/utils";
import {
  campaignTimezone,
  isInSendWindow,
  nextWindowOpen,
  planSendTimes,
  describePlan,
  formatInZone,
} from "@/features/campaigns/drip-schedule";

const PENDING = ["queued", "scheduled"] as const;

export async function reschedulePending(campaignId: string, from = new Date()) {
  const pending = await prisma.campaignLead.findMany({
    where: { campaignId, status: { in: [...PENDING] } },
    orderBy: [{ enrolledAt: "asc" }, { id: "asc" }],
  });
  if (!pending.length) return { times: [] as Date[] };

  const tz = campaignTimezone();
  const times = planSendTimes(pending.length, from, tz);
  for (let i = 0; i < pending.length; i++) {
    await prisma.campaignLead.update({
      where: { id: pending[i].id },
      data: { status: "scheduled", nextSendAt: times[i] },
    });
  }
  return { times };
}

export async function getCampaignProgress(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;

  const grouped = await prisma.campaignLead.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;

  const queued = counts.queued || 0;
  const scheduled = counts.scheduled || 0;
  const sent = counts.sent || 0;
  const failed = counts.failed || 0;
  const cancelled = counts.cancelled || 0;
  const remaining = queued + scheduled;

  const upcoming = await prisma.campaignLead.findMany({
    where: { campaignId, status: "scheduled", nextSendAt: { not: null } },
    orderBy: { nextSendAt: "asc" },
    take: 8,
    include: { lead: { select: { businessName: true, name: true, phone: true } } },
  });

  const tz = campaignTimezone();
  const next = upcoming[0]?.nextSendAt || null;
  const last = upcoming[upcoming.length - 1]?.nextSendAt || null;

  return {
    campaignId,
    campaignStatus: campaign.status,
    targetCount: campaign.targetCount,
    timezone: tz,
    window: "9:00 AM – 7:00 PM",
    inWindow: isInSendWindow(new Date(), tz),
    resumesAt: isInSendWindow(new Date(), tz) ? null : formatInZone(nextWindowOpen(new Date(), tz), tz),
    counts: { queued, scheduled, sent, failed, cancelled, remaining, total: queued + scheduled + sent + failed + cancelled },
    nextSend: next ? formatInZone(next, tz) : null,
    estimatedLastSend: last && remaining ? formatInZone(last, tz) : sent && !remaining ? "Done" : null,
    upcoming: upcoming.map((row) => ({
      id: row.id,
      at: row.nextSendAt ? formatInZone(row.nextSendAt, tz) : null,
      iso: row.nextSendAt?.toISOString() || null,
      lead: row.lead.businessName || row.lead.name || row.lead.phone,
      status: row.status,
    })),
  };
}

export async function processDueSends(limit = 1) {
  const tz = campaignTimezone();
  const now = new Date();

  const active = await prisma.campaign.findMany({ where: { status: "active" }, select: { id: true } });
  const activeIds = active.map((c) => c.id);
  if (!activeIds.length) return { processed: 0, sent: 0, failed: 0, skipped: "no_active" as const };

  // After hours: park remaining work at next 9am with fresh jittered spacing
  if (!isInSendWindow(now, tz)) {
    const open = nextWindowOpen(now, tz);
    for (const id of activeIds) {
      const stale = await prisma.campaignLead.count({
        where: {
          campaignId: id,
          status: { in: [...PENDING] },
          OR: [{ nextSendAt: null }, { nextSendAt: { lt: open } }],
        },
      });
      if (stale) await reschedulePending(id, open);
    }
    return { processed: 0, sent: 0, failed: 0, skipped: "outside_window" as const, resumesAt: formatInZone(open, tz) };
  }

  const due = await prisma.campaignLead.findMany({
    where: {
      campaignId: { in: activeIds },
      status: "scheduled",
      nextSendAt: { lte: now },
    },
    include: { lead: true, campaign: true },
    orderBy: { nextSendAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const templates = parseCampaignMessages(row.campaign.steps);
    const template = templates[row.variant] || templates[0];
    if (!template || !row.lead.phone) {
      await prisma.campaignLead.update({
        where: { id: row.id },
        data: { status: "failed", lastError: "Missing phone or campaign message" },
      });
      failed++;
      continue;
    }

    const body = interpolateMessage(template, row.lead);
    try {
      const { sid, status } = await sendSMS(ensureE164(row.lead.phone), body);
      await prisma.message.create({
        data: {
          leadId: row.leadId,
          campaignId: row.campaignId,
          variant: row.variant,
          direction: "outbound",
          body,
          twilioSid: sid,
          status: status === "failed" ? "failed" : "queued",
        },
      });
      await prisma.lead.update({ where: { id: row.leadId }, data: { status: "contacted" } });
      await prisma.campaignLead.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (err) {
      const lastError = err instanceof Error ? err.message : "SMS failed";
      await prisma.campaignLead.update({
        where: { id: row.id },
        data: { status: "failed", lastError },
      });
      failed++;
    }

    await reschedulePending(row.campaignId, new Date());

    const leftover = await prisma.campaignLead.count({
      where: { campaignId: row.campaignId, status: { in: [...PENDING] } },
    });
    if (!leftover) {
      await prisma.campaign.update({ where: { id: row.campaignId }, data: { status: "completed" } });
    }
  }

  return { processed: due.length, sent, failed };
}

export { describePlan, planSendTimes, campaignTimezone };
