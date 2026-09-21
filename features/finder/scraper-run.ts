import { NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { createClient } from "@supabase/supabase-js";
import { ensureE164 } from "@/shared/utils";
import { runPipeline } from "@/features/finder/pipeline";
import type { Lead as FinderLead, ParsedRequest, PipelineEvent } from "@/features/finder/types";

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
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return ensureE164(trimmed);
}

function cleanWebsite(website: string): string | null {
  const v = (website || "").trim();
  if (!v || /^no link$/i.test(v)) return null;
  return v;
}

export async function saveFinderLeadsToCrm(opts: {
  prompt: string;
  parsed: ParsedRequest | null;
  leads: FinderLead[];
}): Promise<{ stats: SaveStats; leads: SavedCrmLead[]; jobId: string }> {
  const requested = opts.parsed?.targetCount ?? opts.leads.length;
  const category = opts.parsed?.businessType || "Local Business";
  const locationStr = opts.parsed?.city || opts.leads[0]?.location || "";
  const summary = `${locationStr} ${category.toLowerCase()} search`;

  const job = await prisma.searchJob.create({
    data: { prompt: opts.prompt, summary, category, location: locationStr, requested, status: "RUNNING" },
  });

  try {
    const existingLeads = await prisma.lead.findMany({ select: { phone: true } });
    const existingPhones = new Set(existingLeads.map((l) => ensureE164(l.phone)));
    let duplicates = 0;
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
      reviewCount: number;
      googleMapsUrl: string | null;
      notes: string;
      source: string;
      status: string;
      searchJobId: string;
    }[] = [];

    for (const item of opts.leads) {
      const phone = usablePhone(item.phone);
      if (!phone) {
        skippedNoPhone += 1;
        continue;
      }
      if (existingPhones.has(phone)) {
        duplicates += 1;
        continue;
      }
      existingPhones.add(phone);
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
        website: cleanWebsite(item.website),
        reviewCount: item.reviewsCount,
        googleMapsUrl: item.profileUrl || null,
        notes,
        source: "finder",
        status: "new",
        searchJobId: job.id,
      });
    }

    if (newLeadData.length > 0) await prisma.lead.createMany({ data: newLeadData });

    const updatedJob = await prisma.searchJob.update({
      where: { id: job.id },
      data: {
        found: opts.leads.length,
        duplicates,
        newLeads: newLeadData.length,
        status: "COMPLETED",
        completedAt: new Date(),
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
            phone: l.phone,
            website: l.website,
            business_status: "OPERATIONAL",
            google_maps_url: l.googleMapsUrl,
          })),
          { onConflict: "phone", ignoreDuplicates: true },
        );
      } catch (err) {
        console.warn("Supabase mirror notice:", err);
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
    await prisma.searchJob.update({ where: { id: job.id }, data: { status: "FAILED" } }).catch(() => {});
    throw err;
  }
}

export async function runFinderPipeline(
  prompt: string,
  emit: (event: PipelineEvent) => void,
): Promise<{
  parsed: ParsedRequest | null;
  leads: FinderLead[];
  warnings: string[];
  csvFilename: string;
  error: string | null;
}> {
  let parsed: ParsedRequest | null = null;
  let leads: FinderLead[] = [];
  let warnings: string[] = [];
  let csvFilename = "";
  let error: string | null = null;

  await runPipeline(prompt, (event) => {
    emit(event);
    if (event.type === "parsed") parsed = event.parsed;
    if (event.type === "done") {
      leads = event.leads;
      warnings = event.warnings;
      csvFilename = event.csvFilename;
    }
    if (event.type === "error") error = event.message;
  });

  return { parsed, leads, warnings, csvFilename, error };
}

/** Non-streaming scrape used by the Agent API. */
export async function runScrapeJob(prompt: string) {
  try {
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    const result = await runFinderPipeline(prompt.trim(), () => undefined);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    const saved = await saveFinderLeadsToCrm({
      prompt: prompt.trim(),
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
  } catch (err: unknown) {
    console.error("Finder scrape error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to execute search" },
      { status: 500 },
    );
  }
}
