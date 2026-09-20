export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/shared/db";

export async function GET() {
  const replied = await prisma.lead.findMany({
    where: { replied: true },
    orderBy: { lastInboundAt: "desc" },
    take: 40,
    include: {
      messages: { orderBy: { sentAt: "desc" }, take: 4 },
      suggestedReplies: { where: { status: "pending" }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  return NextResponse.json(
    replied.map((lead) => {
      const inbound = lead.messages.find((m) => m.direction === "inbound");
      const outbound = lead.messages.find((m) => m.direction === "outbound");
      return {
        id: lead.id,
        businessName: lead.businessName,
        name: lead.name,
        phone: lead.phone,
        city: lead.city,
        status: lead.status,
        archived: lead.archived,
        replied: lead.replied,
        lastInboundAt: lead.lastInboundAt,
        lastInbound: inbound?.body || null,
        lastOutbound: outbound?.body || null,
        suggestion: lead.suggestedReplies[0]?.body || null,
        suggestionId: lead.suggestedReplies[0]?.id || null,
      };
    })
  );
}
