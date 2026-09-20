export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";

export async function GET() {
  const unread = await prisma.notification.count({ where: { read: false } });
  const items = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { lead: { select: { id: true, businessName: true, name: true, phone: true } } },
  });
  return NextResponse.json({ unread, items });
}

export async function PATCH(req: NextRequest) {
  const { id, all } = await req.json();
  if (all) {
    await prisma.notification.updateMany({ data: { read: true } });
  } else if (id) {
    await prisma.notification.update({ where: { id }, data: { read: true } });
  }
  return NextResponse.json({ ok: true });
}
