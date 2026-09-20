import { prisma } from "@/shared/db";
import { getConfig } from "@/shared/settings";
import { writeDailyBrief } from "@/shared/gemini";
import { addDaysCivil, zonedCivilToUtc } from "@/features/campaigns/drip-schedule";

const CACHE_KEY = "OPERATOR_BRIEF";

function partsInZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return { year: Number(bag.year), month: Number(bag.month), day: Number(bag.day) };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export type OperatorBrief = {
  day: string;
  timezone: string;
  generatedAt: string;
  cached: boolean;
  headline: string;
  body: string;
  actions: string[];
  metrics: Record<string, unknown>;
};

async function snapshot(tz: string) {
  const now = new Date();
  const today = partsInZone(now, tz);
  const yesterday = addDaysCivil(today.year, today.month, today.day, -1);
  const startYesterday = zonedCivilToUtc(yesterday.year, yesterday.month, yesterday.day, 0, 0, tz);
  const startToday = zonedCivilToUtc(today.year, today.month, today.day, 0, 0, tz);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [sentYesterday, sentToday, inboundYesterday, inboundToday, pendingSuggestions, dripRemaining, newLeadsWeek] =
    await Promise.all([
      prisma.message.count({
        where: { direction: "outbound", sentAt: { gte: startYesterday, lt: startToday } },
      }),
      prisma.message.count({
        where: { direction: "outbound", sentAt: { gte: startToday } },
      }),
      prisma.message.findMany({
        where: { direction: "inbound", sentAt: { gte: startYesterday, lt: startToday } },
        include: { lead: { select: { businessName: true, name: true, city: true, status: true, phone: true } } },
        orderBy: { sentAt: "desc" },
        take: 40,
      }),
      prisma.message.findMany({
        where: { direction: "inbound", sentAt: { gte: startToday } },
        include: { lead: { select: { businessName: true, name: true, city: true, status: true, phone: true } } },
        orderBy: { sentAt: "desc" },
        take: 40,
      }),
      prisma.suggestedReply.findMany({
        where: { status: "pending" },
        include: { lead: { select: { businessName: true, name: true, city: true, phone: true } } },
        take: 8,
        orderBy: { createdAt: "desc" },
      }),
      prisma.campaignLead.count({ where: { status: { in: ["queued", "scheduled"] } } }),
      prisma.lead.findMany({
        where: { createdAt: { gte: weekAgo } },
        select: { city: true, state: true },
        take: 200,
      }),
    ]);

  const inbound = [...inboundToday, ...inboundYesterday];
  const interested = inbound.filter((m) => m.isInterested === true || m.lead.status === "interested");
  const notInterested = inbound.filter((m) => m.lead.status === "not_interested" || m.sentiment === "negative" || m.sentiment === "opted_out");

  const cityCounts: Record<string, number> = {};
  for (const l of newLeadsWeek) {
    const key = [l.city, l.state].filter(Boolean).join(", ") || "unknown";
    cityCounts[key] = (cityCounts[key] || 0) + 1;
  }
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  const summarize = (m: (typeof inbound)[0]) => ({
    shop: m.lead.businessName || m.lead.name || m.lead.phone,
    city: m.lead.city,
    status: m.lead.status,
    said: m.body.slice(0, 140),
  });

  return {
    timezone: tz,
    day: `${today.year}-${pad(today.month)}-${pad(today.day)}`,
    window: "calendar yesterday + today so far (local timezone)",
    sentYesterday,
    sentToday,
    repliesYesterday: inboundYesterday.length,
    repliesToday: inboundToday.length,
    interested: interested.slice(0, 8).map(summarize),
    notInterestedCount: notInterested.length,
    needsYou: pendingSuggestions.map((s) => ({
      shop: s.lead.businessName || s.lead.name || s.lead.phone,
      city: s.lead.city,
      draft: s.body.slice(0, 120),
    })),
    dripRemaining,
    topCitiesThisWeek: topCities,
  };
}

function fallbackBrief(snap: Awaited<ReturnType<typeof snapshot>>) {
  const interested = snap.interested[0];
  const headline =
    snap.sentYesterday + snap.sentToday + snap.repliesYesterday + snap.repliesToday === 0
      ? "Quiet so far — nothing to chase yet"
      : `${snap.sentYesterday} sent yesterday, ${snap.repliesYesterday} replied`;
  const body = interested
    ? `${interested.shop} looks interested (“${interested.said}”). ${snap.notInterestedCount} not interested. ${snap.needsYou.length} drafts waiting for you. ${snap.dripRemaining} still in the drip queue.`
    : `Yesterday ${snap.sentYesterday} outbound, ${snap.repliesYesterday} inbound. Today ${snap.sentToday} sent so far. ${snap.needsYou.length} need a human reply. ${snap.dripRemaining} left in drip.`;
  const actions = [
    snap.needsYou[0] ? `Review suggested reply for ${snap.needsYou[0].shop}` : "Check Inbox for anything waiting",
    snap.dripRemaining > 0 ? "Let drip run through the 9 AM–7 PM window" : "Enroll new leads or scrape a city",
    snap.topCitiesThisWeek[0] ? `Consider scraping near ${snap.topCitiesThisWeek[0].city}` : "Scrape 25 plumbers in a target city",
  ];
  return { headline, body, actions };
}

export async function getOperatorBrief(force = false): Promise<OperatorBrief> {
  const cfg = await getConfig();
  const tz = cfg.CRM_TIMEZONE || "America/New_York";
  const snap = await snapshot(tz);

  if (!force) {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: CACHE_KEY } });
      if (row?.value) {
        const cached = JSON.parse(row.value) as OperatorBrief;
        if (cached.day === snap.day && cached.headline) {
          return { ...cached, cached: true, metrics: snap };
        }
      }
    } catch {
      /* generate fresh */
    }
  }

  let copy = fallbackBrief(snap);
  try {
    if (cfg.GEMINI_API_KEY) {
      copy = await writeDailyBrief(snap);
    }
  } catch (e) {
    console.error("Daily brief Gemini failed:", e);
  }

  const payload: OperatorBrief = {
    day: snap.day,
    timezone: tz,
    generatedAt: new Date().toISOString(),
    cached: false,
    headline: copy.headline,
    body: copy.body,
    actions: copy.actions,
    metrics: snap,
  };

  await prisma.appSetting.upsert({
    where: { key: CACHE_KEY },
    create: { key: CACHE_KEY, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  });

  return payload;
}
