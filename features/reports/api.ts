import { NextResponse } from "next/server";
import { prisma } from "@/shared/db";

export const dynamic = "force-dynamic";

type Bucket = { variant: number; sent: number; delivered: number; replies: number; interested: number; optOuts: number };

function rate(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { messages: { select: { direction: true, status: true, sentiment: true, isInterested: true, variant: true } } },
  });

  const rows = campaigns.flatMap((campaign) => {
    const variants = [0, 1].map((variant): Bucket => {
      const messages = campaign.messages.filter((message) => message.variant === variant);
      const outbound = messages.filter((message) => message.direction === "outbound");
      const inbound = messages.filter((message) => message.direction === "inbound");
      return {
        variant,
        sent: outbound.filter((message) => message.status !== "failed").length,
        delivered: outbound.filter((message) => message.status === "delivered").length,
        replies: inbound.length,
        interested: inbound.filter((message) => message.isInterested === true || message.sentiment === "positive").length,
        optOuts: inbound.filter((message) => message.sentiment === "opted_out").length,
      };
    }).filter((bucket) => bucket.sent || bucket.replies);

    return (variants.length ? variants : [{ variant: 0, sent: 0, delivered: 0, replies: 0, interested: 0, optOuts: 0 }]).map((bucket) => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      ...bucket,
      replyRate: rate(bucket.replies, bucket.delivered || bucket.sent),
      interestedRate: rate(bucket.interested, bucket.delivered || bucket.sent),
      optOutRate: rate(bucket.optOuts, bucket.replies),
    }));
  });

  const totals = rows.reduce((sum, row) => ({
    sent: sum.sent + row.sent,
    delivered: sum.delivered + row.delivered,
    replies: sum.replies + row.replies,
    interested: sum.interested + row.interested,
    optOuts: sum.optOuts + row.optOuts,
  }), { sent: 0, delivered: 0, replies: 0, interested: 0, optOuts: 0 });

  const winner = rows.filter((row) => row.delivered || row.sent).sort((a, b) => b.interestedRate - a.interestedRate || b.interested - a.interested)[0] || null;
  return NextResponse.json({
    totals: { ...totals, replyRate: rate(totals.replies, totals.delivered || totals.sent), interestedRate: rate(totals.interested, totals.delivered || totals.sent), optOutRate: rate(totals.optOuts, totals.replies) },
    winner,
    rows,
  });
}
