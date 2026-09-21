export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { z } from "zod";
import { ensureE164, websitePrismaWhere } from "@/shared/utils";

const CreateLeadSchema = z.object({
  name: z.string().optional().nullable(),
  phone: z.string().min(7),
  email: z.string().optional().nullable(),
  businessName: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  rating: z.number().optional().nullable(),
  reviewCount: z.number().int().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function emptyToNull(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const archived = searchParams.get("archived");
    const unenrolledOnly = searchParams.get("unenrolled") === "true";
    const website = searchParams.get("website");

    const where: Record<string, unknown> = {
      ...(archived === "true" ? { archived: true } : archived === "all" ? {} : { archived: false }),
      ...(status && status !== "all" ? { status } : {}),
      ...(source && source !== "all" ? { source } : {}),
      ...(unenrolledOnly ? { campaignLeads: { none: {} } } : {}),
      ...websitePrismaWhere(website),
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

    const picker = searchParams.get("picker") === "true";

    const [data, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        ...(picker
          ? {
              include: {
                campaignLeads: {
                  select: {
                    campaignId: true,
                    status: true,
                    campaign: { select: { id: true, name: true, status: true } },
                  },
                },
              },
            }
          : {}),
      }),
      prisma.lead.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load leads";
    return NextResponse.json({ error: msg, data: [], total: 0 }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check phone and email fields", details: parsed.error.flatten() }, { status: 400 });

  try {
    const email = emptyToNull(parsed.data.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    const lead = await prisma.lead.create({
      data: {
        ...parsed.data,
        email,
        phone: ensureE164(parsed.data.phone),
        source: "manual",
        status: "new",
      },
    });
    return NextResponse.json(lead, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg.includes("Unique") || msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "Phone number already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  if (typeof data.phone === "string") data.phone = ensureE164(data.phone);
  const lead = await prisma.lead.update({ where: { id }, data });
  return NextResponse.json(lead);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
