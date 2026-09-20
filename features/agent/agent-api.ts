import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { ensureE164 } from "@/shared/utils";
import { getConfig, configStatus } from "@/shared/settings";
import { sendSMS } from "@/features/inbox/telnyx";
import { parseCampaignMessage } from "@/shared/utils";
import { reschedulePending, getCampaignProgress } from "@/features/campaigns/drip-runner";
import { campaignTimezone, describePlan, nextWindowOpen } from "@/features/campaigns/drip-schedule";
import { runScrapeJob } from "@/features/finder/scraper-run";
import { AGENT_CATALOG } from "@/features/agent/agent-catalog";

const LEAD_PATCH = new Set([
  "name", "phone", "email", "businessName", "category", "city", "address",
  "website", "rating", "reviewCount", "status", "notes", "archived",
]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function q(req: NextRequest) {
  return req.nextUrl.searchParams;
}

async function readBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function handleAgentRequest(req: NextRequest, method: string) {
  const parts = req.nextUrl.pathname.replace(/^\/api\/v1\/?/, "").split("/").filter(Boolean);

  if (parts.length === 0) return json(AGENT_CATALOG);

  const [a, b, c] = parts;

  if (a === "health" && method === "GET") {
    const cfg = await getConfig();
    return json({ ok: true, ...configStatus(cfg), timezone: cfg.CRM_TIMEZONE });
  }

  if (a === "brief" && method === "GET") {
    const { getOperatorBrief } = await import("@/features/overview/brief");
    const force = q(req).get("refresh") === "1";
    return json(await getOperatorBrief(force));
  }

  if (a === "stats" && method === "GET") {
    const res = await fetch(new URL("/api/stats", req.nextUrl.origin), { cache: "no-store" });
    return json(await res.json(), res.status);
  }

  if (a === "leads" && b === "import" && method === "POST") {
    const { leads } = await readBody(req);
    if (!Array.isArray(leads)) return json({ error: "leads array required" }, 400);
    let imported = 0;
    for (const row of leads) {
      if (!row?.phone) continue;
      const phone = ensureE164(String(row.phone));
      await prisma.lead.upsert({
        where: { phone },
        create: {
          phone,
          businessName: row.businessName || row.company || null,
          name: row.name || null,
          city: row.city || null,
          source: "import",
        },
        update: {},
      });
      imported++;
    }
    return json({ imported, success: true });
  }

  if (a === "leads" && !b && method === "GET") {
    const status = q(req).get("status");
    const search = q(req).get("search") || "";
    const archived = q(req).get("archived");
    const unenrolledOnly = q(req).get("unenrolled") === "true";
    const page = Math.max(1, parseInt(q(req).get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(q(req).get("limit") || "50")));
    const where: Record<string, unknown> = {
      ...(archived === "true" ? { archived: true } : archived === "all" ? {} : { archived: false }),
      ...(status && status !== "all" ? { status } : {}),
      ...(unenrolledOnly ? { campaignLeads: { none: {} } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              { businessName: { contains: search } },
              { city: { contains: search } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.lead.count({ where }),
    ]);
    return json({ data, total, page, limit });
  }

  if (a === "leads" && !b && method === "POST") {
    const body = await readBody(req);
    if (!body.phone) return json({ error: "phone required" }, 400);
    try {
      const lead = await prisma.lead.create({
        data: {
          phone: ensureE164(String(body.phone)),
          name: body.name || null,
          email: body.email || null,
          businessName: body.businessName || null,
          category: body.category || null,
          city: body.city || null,
          website: body.website || null,
          notes: body.notes || null,
          source: "manual",
          status: "new",
        },
      });
      return json(lead, 201);
    } catch {
      return json({ error: "Phone already exists or create failed" }, 409);
    }
  }

  if (a === "leads" && b && method === "GET") {
    const lead = await prisma.lead.findUnique({
      where: { id: b },
      include: {
        messages: { orderBy: { sentAt: "asc" }, take: 50 },
        suggestedReplies: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, take: 1 },
        campaignLeads: true,
      },
    });
    if (!lead) return json({ error: "Lead not found" }, 404);
    return json(lead);
  }

  if (a === "leads" && b && method === "PATCH") {
    const body = await readBody(req);
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (LEAD_PATCH.has(k)) data[k] = v;
    }
    if (typeof data.phone === "string") data.phone = ensureE164(data.phone);
    if (data.archived === true) data.archivedAt = new Date();
    if (data.archived === false) data.archivedAt = null;
    try {
      const lead = await prisma.lead.update({ where: { id: b }, data });
      return json(lead);
    } catch {
      return json({ error: "Lead not found" }, 404);
    }
  }

  if (a === "leads" && b && method === "DELETE") {
    await prisma.lead.delete({ where: { id: b } }).catch(() => null);
    return json({ success: true });
  }

  if (a === "inbox" && method === "GET") {
    const limit = Math.min(100, parseInt(q(req).get("limit") || "50"));
    const latest = await prisma.message.findMany({
      where: { direction: "inbound" },
      orderBy: { sentAt: "desc" },
      include: { lead: { select: { id: true, name: true, businessName: true, phone: true, city: true, status: true, archived: true } } },
      take: limit,
      distinct: ["leadId"],
    });
    return json(latest);
  }

  if (a === "messages" && method === "GET") {
    const leadId = q(req).get("leadId");
    const limit = Math.min(200, parseInt(q(req).get("limit") || "50"));
    if (leadId) {
      return json(await prisma.message.findMany({ where: { leadId }, orderBy: { sentAt: "asc" }, take: limit }));
    }
    return json(await prisma.message.findMany({ orderBy: { sentAt: "desc" }, take: limit, include: { lead: { select: { businessName: true, phone: true } } } }));
  }

  if (a === "sms" && method === "POST") {
    const { leadId, message, suggestionId } = await readBody(req);
    if (!leadId || !message) return json({ error: "leadId and message required" }, 400);
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead?.phone) return json({ error: "Lead not found" }, 404);
    const cfg = await getConfig();
    if (!cfg.TELNYX_API_KEY || !cfg.TELNYX_PHONE_NUMBER) return json({ error: "Telnyx is not configured" }, 400);
    try {
      const { sid, status } = await sendSMS(ensureE164(lead.phone), message);
      const msg = await prisma.message.create({
        data: { leadId, direction: "outbound", body: message, twilioSid: sid, status: "queued" },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: lead.status === "new" ? "contacted" : lead.status },
      });
      if (suggestionId) {
        await prisma.suggestedReply.updateMany({ where: { id: suggestionId, leadId }, data: { status: "sent" } });
      }
      return json({ success: true, messageId: msg.id, providerSid: sid, status });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "SMS failed" }, 500);
    }
  }

  if (a === "replies" && method === "GET") {
    const origin = await fetch(new URL("/api/replies", req.nextUrl.origin), { cache: "no-store" });
    return json(await origin.json(), origin.status);
  }

  if (a === "suggestions" && !b && method === "GET") {
    const leadId = q(req).get("leadId");
    const pending = await prisma.suggestedReply.findMany({
      where: { status: "pending", ...(leadId ? { leadId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { lead: { select: { id: true, businessName: true, name: true, phone: true, city: true } } },
    });
    return json(pending);
  }

  if (a === "suggestions" && b && method === "PATCH") {
    const { status } = await readBody(req);
    if (!["dismissed", "sent"].includes(status)) return json({ error: "status must be sent or dismissed" }, 400);
    const row = await prisma.suggestedReply.update({ where: { id: b }, data: { status } });
    return json(row);
  }

  if (a === "notifications" && method === "GET") {
    const unread = await prisma.notification.count({ where: { read: false } });
    const items = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { lead: { select: { id: true, businessName: true, name: true, phone: true } } },
    });
    return json({ unread, items });
  }

  if (a === "notifications" && method === "PATCH") {
    const { id, all } = await readBody(req);
    if (all) await prisma.notification.updateMany({ data: { read: true } });
    else if (id) await prisma.notification.update({ where: { id }, data: { read: true } });
    return json({ ok: true });
  }

  if (a === "campaigns" && !b && method === "GET") {
    const origin = await fetch(new URL("/api/campaigns", req.nextUrl.origin), { cache: "no-store" });
    return json(await origin.json(), origin.status);
  }

  if (a === "campaigns" && !b && method === "POST") {
    const { name, description, message, status = "draft" } = await readBody(req);
    if (!name || !message) return json({ error: "name and message required" }, 400);
    const campaign = await prisma.campaign.create({
      data: { name, description, steps: JSON.stringify([{ message }]), status },
    });
    return json(campaign, 201);
  }

  if (a === "campaigns" && b && c === "enroll" && method === "POST") {
    const { leadIds, count } = await readBody(req);
    if (!leadIds?.length) return json({ error: "leadIds required" }, 400);
    const cfg = await getConfig();
    if (!cfg.TELNYX_API_KEY || !cfg.TELNYX_PHONE_NUMBER) return json({ error: "Telnyx is not configured" }, 400);
    const campaign = await prisma.campaign.findUnique({ where: { id: b } });
    if (!campaign) return json({ error: "Campaign not found" }, 404);
    if (campaign.status === "stopped") return json({ error: "Stopped campaigns cannot enroll" }, 400);
    if (!parseCampaignMessage(campaign.steps)) return json({ error: "Campaign has no message" }, 400);
    const target = Math.min(Math.max(1, Number(count) || leadIds.length), leadIds.length);
    const picked = leadIds.slice(0, target);
    const queuedIds: string[] = [];
    for (const leadId of picked) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { campaignLeads: true } });
      if (!lead?.phone) continue;
      if (lead.campaignLeads?.length) continue;
      if (lead.status !== "new") continue;
      await prisma.campaignLead.create({ data: { campaignId: b, leadId, status: "queued", currentStep: 0 } });
      queuedIds.push(leadId);
    }
    if (!queuedIds.length) return json({ error: "No eligible new leads to queue" }, 400);
    await prisma.campaign.update({ where: { id: b }, data: { status: "active", targetCount: queuedIds.length } });
    const { times } = await reschedulePending(b, new Date());
    return json({
      enrolled: queuedIds.length,
      plan: describePlan(times, campaignTimezone()),
      progress: await getCampaignProgress(b),
    });
  }

  if (a === "campaigns" && b && c === "control" && method === "POST") {
    const { action } = await readBody(req);
    const campaign = await prisma.campaign.findUnique({ where: { id: b } });
    if (!campaign) return json({ error: "Campaign not found" }, 404);
    if (action === "pause") await prisma.campaign.update({ where: { id: b }, data: { status: "paused" } });
    else if (action === "resume") {
      if (campaign.status === "stopped") return json({ error: "Stopped campaigns cannot be resumed" }, 400);
      await prisma.campaign.update({ where: { id: b }, data: { status: "active" } });
      await reschedulePending(b, nextWindowOpen(new Date(), campaignTimezone()));
    } else if (action === "stop") {
      await prisma.campaign.update({ where: { id: b }, data: { status: "stopped" } });
      await prisma.campaignLead.updateMany({
        where: { campaignId: b, status: { in: ["queued", "scheduled"] } },
        data: { status: "cancelled", nextSendAt: null },
      });
    } else return json({ error: "action must be pause, resume, or stop" }, 400);
    return json({ ok: true, progress: await getCampaignProgress(b) });
  }

  if (a === "campaigns" && b && c === "progress" && method === "GET") {
    const progress = await getCampaignProgress(b);
    if (!progress) return json({ error: "Campaign not found" }, 404);
    return json(progress);
  }

  if (a === "campaigns" && b && method === "PATCH") {
    const { message, name, description } = await readBody(req);
    const campaign = await prisma.campaign.update({
      where: { id: b },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(message ? { steps: JSON.stringify([{ message }]) } : {}),
      },
    });
    return json(campaign);
  }

  if (a === "campaigns" && b && method === "DELETE") {
    await prisma.campaign.delete({ where: { id: b } });
    return json({ success: true });
  }

  if (a === "scrape" && method === "POST") {
    const { prompt } = await readBody(req);
    if (!prompt) return json({ error: "prompt required, e.g. Find 25 plumbers in Houston TX, under 150 reviews" }, 400);
    return runScrapeJob(String(prompt));
  }

  if (a === "jobs" && method === "GET") {
    const jobs = await prisma.searchJob.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return json({ jobs });
  }

  return json({ error: "Unknown agent endpoint. GET /api/v1 for the catalog.", path: parts, method }, 404);
}
