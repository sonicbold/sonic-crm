export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/shared/db";

export async function GET() {
  try {
  const [
    totalLeads,
    leadsContacted,
    leadsInterested,
    leadsNotInterested,
    queuedLeads,
    repliedLeads,
    archivedLeads,
    pendingSuggestions,
    messagesSent,
    messagesDelivered,
    inboundReplies,
    positiveReplies,
    negativeReplies,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: { not: "new" } } }),
    prisma.lead.count({ where: { status: "interested" } }),
    prisma.lead.count({ where: { status: "not_interested" } }),
    prisma.lead.count({ where: { status: "new", archived: false } }),
    prisma.lead.count({ where: { replied: true } }),
    prisma.lead.count({ where: { archived: true } }),
    prisma.suggestedReply.count({ where: { status: "pending" } }),
    prisma.message.count({ where: { direction: "outbound" } }),
    prisma.message.count({ where: { direction: "outbound", status: "delivered" } }),
    prisma.message.count({ where: { direction: "inbound" } }),
    prisma.message.count({ where: { sentiment: "positive" } }),
    prisma.message.count({ where: { sentiment: { in: ["negative", "opted_out"] } } }),
  ]);

  // #region agent log
  fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
    body: JSON.stringify({
      sessionId: "9903e8",
      runId: "post-fix",
      hypothesisId: "C",
      location: "app/api/stats/route.ts:GET",
      message: "stats query ok",
      data: { totalLeads, queuedLeads, repliedLeads },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return NextResponse.json({
    queuedLeads,
    totalLeads,
    leadsContacted,
    leadsInterested,
    leadsNotInterested,
    repliedLeads,
    archivedLeads,
    pendingSuggestions,
    messagesSent,
    messagesDelivered,
    inboundReplies,
    positiveReplies,
    negativeReplies,
    replyRate: messagesSent > 0 ? Math.round((inboundReplies / messagesSent) * 100) : 0,
    deliveryRate: messagesSent > 0 ? Math.round((messagesDelivered / messagesSent) * 100) : 0,
    interestRate: inboundReplies > 0 ? Math.round((positiveReplies / inboundReplies) * 100) : 0,
  });
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
      body: JSON.stringify({
        sessionId: "9903e8",
        runId: "post-fix",
        hypothesisId: "C",
        location: "app/api/stats/route.ts:GET",
        message: "stats query failed",
        data: { error: err instanceof Error ? err.message : String(err) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw err;
  }
}
