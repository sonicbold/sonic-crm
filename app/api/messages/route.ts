export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");
  const limit = parseInt(searchParams.get("limit") || "50");

  if (leadId) {
    const messages = await prisma.message.findMany({
      where: { leadId },
      orderBy: { sentAt: "asc" },
      take: limit,
    });
    return NextResponse.json(messages);
  }

  // Inbox view: latest message per lead
  const latest = await prisma.message.findMany({
    where: { direction: "inbound" },
    orderBy: { sentAt: "desc" },
    include: { lead: { select: { id: true, name: true, businessName: true, phone: true, city: true, status: true } } },
    take: limit,
    distinct: ["leadId"],
  });

  return NextResponse.json(latest);
}

