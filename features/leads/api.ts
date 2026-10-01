/**
 * Leads list/create/edit/archive. Import is features/leads/import.ts.
 * Phone uniqueness is the CRM identity — do not drop the E.164 + unique checks.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { z } from "zod";
import { ensureE164, websitePrismaWhere } from "@/shared/utils";
import { websiteFields } from "@/shared/website-status";
import { backfillWebsiteStatuses } from "@/features/leads/website-backfill";
import { logger } from "@/shared/log";
import { jsonError } from "@/shared/route";

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

const UpdateLeadSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional().nullable(),
  phone: z.string().min(7).optional(),
  email: z.string().optional().nullable(),
  businessName: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["new", "contacted", "interested", "not_interested", "closed"]).optional(),
  googleMapsUrl: z.string().optional().nullable(),
  rating: z.number().optional().nullable(),
  reviewCount: z.number().int().optional().nullable(),
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
    await backfillWebsiteStatuses();

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
    logger("leads").error("load failed", { err });
    const msg = err instanceof Error ? err.message : "Failed to load leads";
    return jsonError("leads", msg, 500, { data: [], total: 0 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return jsonError("leads", "Check phone and email fields", 400, { details: parsed.error.flatten() });

  try {
    const email = emptyToNull(parsed.data.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError("leads", "Invalid email", 400);
    }
    const site = websiteFields(parsed.data.website);
    const lead = await prisma.lead.create({
      data: {
        ...parsed.data,
        ...site,
        email,
        phone: ensureE164(parsed.data.phone),
        source: "manual",
        status: "new",
      },
    });
    return NextResponse.json(lead, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    if (/unique/i.test(msg)) return jsonError("leads", "Phone number already exists", 409);
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = UpdateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("leads", "Check the lead fields", 400, { details: parsed.error.flatten() });
  }
  const { id, ...patch } = parsed.data;
  if (typeof patch.phone === "string") patch.phone = ensureE164(patch.phone);
  if ("email" in patch) patch.email = emptyToNull(patch.email);
  if ("website" in patch) Object.assign(patch, websiteFields(patch.website));
  try {
    const lead = await prisma.lead.update({ where: { id }, data: patch });
    return NextResponse.json(lead);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    if (/unique/i.test(msg)) return jsonError("leads", "Phone number already exists", 409);
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const singleId = url.searchParams.get("id");
  const idsParam = url.searchParams.get("ids");

  let ids: string[] = [];
  if (singleId) {
    ids = [singleId];
  } else if (idsParam) {
    ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    try {
      const body = await req.json();
      if (Array.isArray(body?.ids)) {
        ids = body.ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      }
    } catch {
      // no JSON body
    }
  }

  ids = [...new Set(ids)].slice(0, 500);
  if (ids.length === 0) {
    return jsonError("leads", "ID or ids required", 400);
  }

  const result = await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ success: true, deleted: result.count });
}
