export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campaignLeads: true, messages: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const { name, description, steps, status = "draft" } = await req.json();
  if (!name || !steps?.length) return NextResponse.json({ error: "Name and steps required" }, { status: 400 });

  const campaign = await prisma.campaign.create({
    data: { name, description, steps: JSON.stringify(steps), status },
  });
  return NextResponse.json(campaign, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, steps, ...rest } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { ...rest, ...(steps ? { steps: JSON.stringify(steps) } : {}) },
  });
  return NextResponse.json(campaign);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  try {
    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete campaign" }, { status: 500 });
  }
}

