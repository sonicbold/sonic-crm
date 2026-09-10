export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const CreateLeadSchema = z.object({
  name: z.string().optional(),
  phone: z.string().min(7),
  email: z.string().email().optional().nullable(),
  businessName: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  rating: z.number().optional().nullable(),
  reviewCount: z.number().int().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const source = searchParams.get("source");
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
  const skip = (page - 1) * limit;

  const unenrolledOnly = searchParams.get("unenrolled") === "true";

  const where: any = {
    ...(status && status !== "all" ? { status } : {}),
    ...(source && source !== "all" ? { source } : {}),
    ...(unenrolledOnly ? { campaignLeads: { none: {} } } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search } },
        { phone: { contains: search } },
        { businessName: { contains: search } },
        { city: { contains: search } },
        { category: { contains: search } },
      ],
    } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const lead = await prisma.lead.create({ data: { ...parsed.data, source: "manual", status: "new" } });
    return NextResponse.json(lead, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg.includes("Unique")) return NextResponse.json({ error: "Phone number already exists" }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  const lead = await prisma.lead.update({ where: { id }, data });
  return NextResponse.json(lead);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}


