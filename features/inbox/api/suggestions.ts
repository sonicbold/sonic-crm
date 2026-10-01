export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/shared/route";
import { prisma } from "@/shared/db";

export async function GET(req: NextRequest) {
  const leadId = new URL(req.url).searchParams.get("leadId");
  const pending = await prisma.suggestedReply.findMany({
    where: { status: "pending", ...(leadId ? { leadId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { lead: { select: { id: true, businessName: true, name: true, phone: true, city: true } } },
  });
  return NextResponse.json(pending);
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  if (!id || !["dismissed", "sent"].includes(status)) {
    return jsonError("inbox.suggestions", "id and status required", 400);
  }
  const row = await prisma.suggestedReply.update({ where: { id }, data: { status } });
  return NextResponse.json(row);
}
