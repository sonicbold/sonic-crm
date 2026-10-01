import { NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { createClient } from "@supabase/supabase-js";
import { ensureE164 } from "@/shared/utils";
import { isTollFreePhone, phoneKey } from "@/features/finder/valid";
import { websiteDedupKey, websiteFields } from "@/shared/website-status";
import { runAutonomousPipeline } from "@/features/finder/pipeline";
import type { Lead as FinderLead, ParsedRequest, PipelineEvent } from "@/features/finder/types";
import { logger } from "@/shared/log";

export type SavedCrmLead = {
  id: string;
  businessName: string;
  category: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  status: string;
  name: string | null;
  notes: string | null;
};

export type SaveStats = {
  requested: number;
  found: number;
  duplicates: number;
  newLeads: number;
  skippedNoPhone: number;
};

export function splitLocation(location: string): { city: string; state: string; address: string } {
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length && /^(usa|us|united states)$/i.test(parts[parts.length - 1])) {
    parts.pop();
  }

  let result: { city: string; state: string; address: string };
  if (parts.length === 0) {
    result = { address: location, city: "", state: "" };
  } else if (parts.length === 1) {
    result = { address: location, city: parts[0], state: "" };
  } else {
    const last = parts[parts.length - 1];
    const stateMatch = last.match(/^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    const state = stateMatch ? stateMatch[1].toUpperCase() : last.replace(/\d.*/g, "").trim();
    const city = parts[parts.length - 2] || "";
    result = { address: location, city, state };
  }

  return result;
}

function usablePhone(phone: string): string | null {
  const trimmed = (phone || "").trim();
  if (!trimmed || /^not listed$/i.test(trimmed)) return null;
  if (isTollFreePhone(trimmed)) return null;
  const key = phoneKey(trimmed);
  if (!key) return null;
  return ensureE164(trimmed);
}

export async function saveFinderLeadsToCrm(opts: {
  prompt: string;
  parsed: ParsedRequest | null;
  leads: FinderLead[];
  jobId?: string | null;
  finish?: boolean;
}): Promise<{ stats: SaveStats; leads: SavedCrmLead[]; jobId: string }> {
  const requested = opts.leads.length || opts.parsed?.targetCount || 0;
  const category = opts.parsed?.businessType || "Local Business";
  const locationStr = opts.parsed?.city || opts.leads[0]?.location || "";
  const summary = `${locationStr} ${category.toLowerCase()} search`;
  const finish = opts.finish !== false;

  let job = opts.jobId
    ? await prisma.searchJob.findUnique({ where: { id: opts.jobId } })
    : null;
  if (!job) {
    job = await prisma.searchJob.create({
      data: { prompt: opts.prompt, summary, category, location: locationStr, requested, status: "RUNNING" },
    });
  }

  try {
    const existingLeads = await prisma.lead.findMany({ select: { id: true, phone: true, name: true, website: true } });
    const existingPhones = new Set<string>();
    const existingWebsites = new Set<string>();
    const existingByPhone = new Map<string, { id: string; name: string | null }>();
    for (const row of existingLeads) {
      const key = phoneKey(row.phone);
      if (key) {
        existingPhones.add(key);
        existingByPhone.set(key, { id: row.id, name: row.name });
      }
      const web = websiteDedupKey(row.website);
      if (web) existingWebsites.add(web);
    }
    let duplicates = 0;
    let namesFilled = 0;
    let skippedNoPhone = 0;
    const newLeadData: {
      name: string | null;
      businessName: string;
      category: string;
      city: string;
      state: string;
      address: string;
      phone: string;
      website: string | null;
      websiteStatus: string;
      reviewCount: number;
      rating: number | null;
      googleMapsUrl: string | null;
      notes: string;
      source: string;
      status: string;
      searchJobId: string;
    }[] = [];

    for (const item of opts.leads) {
      const phone = usablePhone(item.phone);
      const key = phone ? phoneKey(phone) : null;
      if (!phone || !key) {
        skippedNoPhone += 1;
        continue;
      }
      if (existingPhones.has(key)) {
        const known = existingByPhone.get(key);
        const owner = item.ownerName && !/not found/i.test(item.ownerName) ? item.ownerName : null;
        if (known && owner && !known.name) {
          await prisma.lead.update({ where: { id: known.id }, data: { name: owner } });
          known.name = owner;
          namesFilled += 1;
        }
        duplicates += 1;
        continue;
      }
      const site = websiteFields(item.website);
      const web = websiteDedupKey(item.website);
      if (web && existingWebsites.has(web)) {
        duplicates += 1;
        continue;
      }
      existingPhones.add(key);
      if (web) existingWebsites.add(web);
      const loc = splitLocation(item.location);
      const owner = item.ownerName && !/not found/i.test(item.ownerName) ? item.ownerName : null;
      const notes = [item.summary, item.note].filter(Boolean).join("\n");
      newLeadData.push({
        name: owner,
        businessName: item.businessName,
        category,
        city: loc.city,
        state: loc.state,
        address: loc.address,
        phone,
        website: site.website,
        websiteStatus: site.websiteStatus,
        reviewCount: item.reviewsCount,
        rating: item.rating ?? null,
        googleMapsUrl: item.profileUrl || null,
        notes,
        source: "finder",
        status: "new",
        searchJobId: job.id,
      });
    }

    if (newLeadData.length > 0) await prisma.lead.createMany({ data: newLeadData });
    if (namesFilled) logger("finder.save").info("Filled owner names on existing leads", { namesFilled });

    const updatedJob = await prisma.searchJob.update({
      where: { id: job.id },
      data: {
        found: { increment: opts.leads.length },
        duplicates: { increment: duplicates },
        newLeads: { increment: newLeadData.length },
        location: locationStr || job.location,
        summary,
        ...(finish
          ? { status: "COMPLETED", completedAt: new Date() }
          : { status: "RUNNING", completedAt: null }),
      },
      include: { leads: { take: 50, orderBy: { createdAt: "desc" } } },
    });

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && newLeadData.length > 0) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        await supabase.from("businesses").upsert(
          newLeadData.map((l) => ({
            business_name: l.businessName,
            category: l.category,
            city: l.city,
            state: l.state,
            review_count: l.reviewCount,
            rating: l.rating,
            phone: l.phone,
            website: l.website,
            business_status: "OPERATIONAL",
            google_maps_url: l.googleMapsUrl,
          })),
          { onConflict: "phone", ignoreDuplicates: true },
        );
      } catch (err) {
        logger("finder.save").warn("Supabase mirror skipped", { err });
      }
    }

    return {
      jobId: job.id,
      stats: {
        requested,
        found: opts.leads.length,
        duplicates,
        newLeads: newLeadData.length,
        skippedNoPhone,
      },
      leads: updatedJob.leads.map((lead) => ({
        id: lead.id,
        businessName: lead.businessName || "",
        category: lead.category || "",
        city: lead.city || "",
        state: lead.state || "",
        address: lead.address || "",
        phone: lead.phone,
        website: lead.website,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
        googleMapsUrl: lead.googleMapsUrl,
        status: lead.status,
        name: lead.name,
        notes: lead.notes,
      })),
    };
  } catch (err) {
    logger("finder.save").error("save failed", { err, jobId: job.id, requested });
    await prisma.searchJob.update({ where: { id: job.id }, data: { status: "FAILED" } }).catch(() => {});
    throw err;
  }
}

type FinderRunResult = {
  parsed: ParsedRequest | null;
  leads: FinderLead[];
  warnings: string[];
  csvFilename: string;
  error: string | null;
  paused: boolean;
  hitLeadCap: boolean;
};

async function followPipeline(
  emit: (event: PipelineEvent) => void,
  run: (emit: (event: PipelineEvent) => void) => Promise<void>,
): Promise<FinderRunResult> {
  let parsed: ParsedRequest | null = null;
  let leads: FinderLead[] = [];
  let warnings: string[] = [];
  let csvFilename = "";
  let error: string | null = null;
  let paused = false;
  let hitLeadCap = false;

  await run((event) => {
    emit(event);
    if (event.type === "parsed") parsed = event.parsed;
    if (event.type === "done") {
      leads = event.leads;
      warnings = event.warnings;
      csvFilename = event.csvFilename;
      paused = Boolean(event.paused);
      hitLeadCap = Boolean(event.hitLeadCap);
      if (event.spendLog) warnings.push(event.spendLog);
    }
    if (event.type === "error") error = event.message;
  });

  return { parsed, leads, warnings, csvFilename, error, paused, hitLeadCap };
}

export function runAutonomousFinder(
  emit: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<FinderRunResult> {
  return followPipeline(emit, (inner) => runAutonomousPipeline(inner, signal));
}

/** Non-streaming scrape used by the Agent API. */
export async function runScrapeJob(_prompt?: string) {
  const result = await runAutonomousFinder(() => undefined);
  if (result.error) {
    return NextResponse.json({ error: result.error, feature: "finder.scrape" }, { status: 502 });
  }
  const saved = await saveFinderLeadsToCrm({
    prompt: `Canvass ${result.parsed?.city || "plumber markets"}`,
    parsed: result.parsed,
    leads: result.leads,
  });
  return NextResponse.json({
    success: true,
    provider: "finder",
    parsed: result.parsed,
    warnings: result.warnings,
    csvFilename: result.csvFilename,
    stats: saved.stats,
    leads: saved.leads,
  });
}
