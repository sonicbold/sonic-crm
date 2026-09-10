export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [
    totalLeads, leadsContacted, leadsInterested, queuedLeads,
    messagesSent, messagesDelivered,
    inboundReplies, positiveReplies, negativeReplies,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: { not: "new" } } }),
    prisma.lead.count({ where: { status: "interested" } }),
    prisma.lead.count({ where: { status: "new" } }),
    prisma.message.count({ where: { direction: "outbound" } }),
    prisma.message.count({ where: { direction: "outbound", status: "delivered" } }),
    prisma.message.count({ where: { direction: "inbound" } }),
    prisma.message.count({ where: { sentiment: "positive" } }),
    prisma.message.count({ where: { sentiment: "negative" } }),
  ]);

  return NextResponse.json({
    queuedLeads,
    totalLeads,
    leadsContacted,
    leadsInterested,
    messagesSent,
    messagesDelivered,
    inboundReplies,
    positiveReplies,
    negativeReplies,
    replyRate: messagesSent > 0 ? Math.round((inboundReplies / messagesSent) * 100) : 0,
    deliveryRate: messagesSent > 0 ? Math.round((messagesDelivered / messagesSent) * 100) : 0,
    interestRate: inboundReplies > 0 ? Math.round((positiveReplies / inboundReplies) * 100) : 0,
  });
}


