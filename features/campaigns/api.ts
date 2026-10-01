/**
 * Campaign CRUD. Enroll/pause/progress live in enroll.ts, control.ts, progress.ts.
 * Drip sends are campaigns/drip-runner.ts (cron hits /api/cron/drip).
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { jsonError } from "@/shared/route";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campaignLeads: true, messages: true } } },
  });

  const ids = campaigns.map((c) => c.id);
  const grouped = ids.length
    ? await prisma.campaignLead.groupBy({
        by: ["campaignId", "status"],
        where: { campaignId: { in: ids } },
        _count: { _all: true },
      })
    : [];

  const byCampaign: Record<string, Record<string, number>> = {};
  for (const row of grouped) {
    byCampaign[row.campaignId] ??= {};
    byCampaign[row.campaignId][row.status] = row._count._all;
  }

  return NextResponse.json(
    campaigns.map((c) => ({
      ...c,
      dripCounts: {
        queued: byCampaign[c.id]?.queued || 0,
        scheduled: byCampaign[c.id]?.scheduled || 0,
        sent: byCampaign[c.id]?.sent || 0,
        failed: byCampaign[c.id]?.failed || 0,
        cancelled: byCampaign[c.id]?.cancelled || 0,
      },
    }))
  );
}

export async function POST(req: NextRequest) {
  const { name, description, message, messageA, messageB, status = "draft" } = await req.json();
  const first = String(messageA || message || "").trim();
  const second = String(messageB || "").trim();
  if (!name || !first) return jsonError("campaigns", "Name and message required", 400);

  const campaign = await prisma.campaign.create({
    data: { name, description, steps: JSON.stringify([{ message: first }, ...(second ? [{ message: second }] : [])]), status },
  });
  return NextResponse.json(campaign, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, message, name, description } = await req.json();
  if (!id) return jsonError("campaigns", "ID required", 400);
  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(message ? { steps: JSON.stringify([{ message }]) } : {}),
    },
  });
  return NextResponse.json(campaign);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("campaigns", "ID required", 400);
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
