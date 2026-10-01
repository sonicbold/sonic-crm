import { saveCsv } from "@/features/finder/csv";
import { createAiPool, createSummaryPool } from "@/features/finder/llm";
import { collectValidLeads } from "@/features/finder/collect";
import { assertReady, loadSettings } from "@/features/finder/settings";
import type { Lead, ParsedRequest, PipelineEvent } from "@/features/finder/types";
import { autonomousRequest, describeSearch, marketReason, PLUMBER_MARKETS } from "@/features/finder/niche";
import { leadCap, shouldMarkCityDone } from "@/features/finder/canvass";
import { loadMarketRanking } from "@/features/finder/markets";
import { loadCheckpoint, saveCheckpoint } from "@/features/finder/checkpoint";
import { emptySessionMix, formatSessionMixLog, sessionPercents } from "@/features/finder/session-stats";
import { prisma } from "@/shared/db";
import { logger } from "@/shared/log";
import { addSpend, emptySpend, estimateCost, formatSpendLog } from "@/features/finder/spend";
import { isQualityLead, phoneKey } from "@/features/finder/valid";
import { websiteDedupKey } from "@/shared/website-status";

const pipelineLog = logger("finder.pipeline");

function finishWithError(
  err: unknown,
  step: string,
  found: Lead[],
  warnings: string[],
  emit: (event: PipelineEvent) => void,
) {
  const detail = err instanceof Error ? err.message : String(err);
  pipelineLog.error(detail, { step, kept: found.length, err });
  const message = step ? `${step}: ${detail}` : detail;
  if (found.length) {
    warnings.push(message);
    emit({ type: "log", message });
    emit({ type: "done", leads: found, warnings, csvFilename: "" });
    return;
  }
  emit({ type: "error", message });
}

async function loadExistingKeys(): Promise<{ phones: Set<string>; websites: Set<string> }> {
  try {
    const rows = await prisma.lead.findMany({ select: { phone: true, website: true } });
    const phones = new Set<string>();
    const websites = new Set<string>();
    for (const row of rows) {
      const phone = phoneKey(row.phone);
      if (phone) phones.add(phone);
      const web = websiteDedupKey(row.website);
      if (web) websites.add(web);
    }
    return { phones, websites };
  } catch {
    return { phones: new Set(), websites: new Set() };
  }
}

export async function runAutonomousPipeline(
  emit: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const settings = await loadSettings();
  assertReady(settings);
  const warnings: string[] = [];
  const leads: Lead[] = [];
  const spend = emptySpend();
  let step = "Pick the next city";
  let activeProvider = "waiting";
  let lastParsed: ParsedRequest | null = null;

  const citiesTotal = PLUMBER_MARKETS.length;
  const cap = leadCap();
  const targetShown = cap ?? citiesTotal;
  const emitAll = (event: PipelineEvent) => {
    if (event.type === "step") step = event.label;
    emit(event);
  };

  const sessionMix = emptySessionMix();
  const emitAiStatus = (provider: string, nextRequestInMs: number) => {
    activeProvider = provider;
    const percents = sessionPercents(sessionMix);
    emitAll({
      type: "status",
      target: targetShown,
      validLeads: leads.length,
      remaining: cap ? Math.max(0, cap - leads.length) : Math.max(0, citiesTotal - (lastParsed ? 1 : 0)),
      aiProvider: provider,
      nextRequestInMs,
      leadCap: cap,
      nameRatePct: percents.nameRatePct,
      nameDetectNamed: sessionMix.named,
      nameDetectWithReviews: sessionMix.withReviews,
      websitePct: percents.websitePct,
      noWebsitePct: percents.noWebsitePct,
      withWebsite: sessionMix.withWebsite,
      noWebsite: sessionMix.noWebsite,
    });
  };

  const pool = createAiPool(settings, (status) => emitAiStatus(status.provider, status.nextRequestInMs));
  const summaryPool = createSummaryPool(settings, (status) => emitAiStatus(status.provider, status.nextRequestInMs));

  try {
    emitAll({ type: "step", step: 1, label: "Pick the next city" });
    const resume = await loadCheckpoint();
    const citiesDone = new Set(resume?.citiesDone ?? []);
    let jobId = resume?.jobId ?? null;
    let cities = await loadMarketRanking();
    if (resume?.city) {
      const current = cities.find((row) => row.city === resume.city) ?? {
        city: resume.city,
        leads: 0,
        lastSearchedAt: 0,
      };
      cities = [current, ...cities.filter((row) => row.city !== resume.city)];
    }
    const first = cities.find((row) => !citiesDone.has(row.city)) ?? cities[0];
    emitAll({
      type: "log",
      message: first
        ? cap
          ? `Saving ${cap} new shops per batch, then starting the next batch until you turn off. Starting in ${first.city} (${marketReason(first)}). Names via Groq openai/gpt-oss-120b.`
          : resume
            ? `Resuming Canvass in ${resume.city} (Maps query ${resume.queryIndex + 1}). Finished cities stay skipped. Names via Groq openai/gpt-oss-120b.`
            : `Walking ${cities.length} plumber cities, fewest saved leads first. Starting in ${first.city} (${marketReason(first)}). Every qualifying shop is kept. Groq names and Gemini summaries run on separate keys. A shutdown pauses here and continues after restart.`
        : "No cities are configured.",
    });
    if (!first) {
      emitAll({ type: "error", message: "No plumber markets are configured." });
      return;
    }

    const existing = await loadExistingKeys();
    const existingPhones = existing.phones;
    const existingWebsites = existing.websites;

    async function persistBatch(batch: { parsed: ParsedRequest; leads: typeof leads; queryIndex: number; city: string }) {
      const { saveFinderLeadsToCrm } = await import("@/features/finder/scraper-run");
      const saved = await saveFinderLeadsToCrm({
        prompt: `Canvass ${batch.parsed.city}`,
        parsed: batch.parsed,
        leads: batch.leads,
        jobId,
        finish: false,
      });
      jobId = saved.jobId;
      await saveCheckpoint({
        status: "running",
        city: batch.city,
        queryIndex: batch.queryIndex + 1,
        citiesDone: [...citiesDone],
        jobId,
      });
    }

    let paused = false;
    for (let i = 0; i < cities.length; i++) {
      if (cap && leads.length >= cap) break;
      const market = cities[i];
      if (citiesDone.has(market.city)) continue;
      const citiesLeft = cities.filter((row) => !citiesDone.has(row.city)).length;
      const need = cap ? cap - leads.length : 0;
      const parsed = autonomousRequest(market.city, need);
      lastParsed = parsed;
      const startQueryIndex = resume && resume.city === market.city ? resume.queryIndex : 0;
      emitAll({ type: "parsed", parsed });
      emitAll({
        type: "log",
        message: cap
          ? `${describeSearch(parsed)} ${marketReason(market)}. Need ${need} more for this ${cap}-lead batch.`
          : `${describeSearch(parsed)} ${marketReason(market)}. ${citiesLeft} ${citiesLeft === 1 ? "city" : "cities"} left including this one.`,
      });
      emitAll({
        type: "status",
        target: targetShown,
        validLeads: leads.length,
        remaining: cap ? need : citiesLeft,
        aiProvider: activeProvider,
        nextRequestInMs: 0,
        leadCap: cap,
      });
      await saveCheckpoint({
        status: "running",
        city: market.city,
        queryIndex: startQueryIndex,
        citiesDone: [...citiesDone],
        jobId,
      });

      const already = leads.length;
      const collected = await collectValidLeads({
        parsed,
        settings,
        pool,
        existingPhones,
        existingWebsites,
        fillAll: !cap,
        startQueryIndex,
        sessionMix,
        summaryPool,
        onQueryDone: async ({ queryIndex, leads: batchLeads }) => {
          await persistBatch({ parsed, leads: batchLeads, queryIndex, city: market.city });
        },
        emit: (event) => {
          if (event.type === "status") {
            emit({
              type: "status",
              target: targetShown,
              validLeads: already + (event.validLeads ?? 0),
              remaining: cap ? Math.max(0, cap - already - (event.validLeads ?? 0)) : citiesLeft,
              aiProvider: event.aiProvider ?? activeProvider,
              nextRequestInMs: event.nextRequestInMs ?? 0,
              mapsPaidCalls: spend.mapsPaidCalls + (event.mapsPaidCalls ?? 0),
              mapsCacheHits: spend.mapsCacheHits + (event.mapsCacheHits ?? 0),
              crmDuplicates: spend.crmDuplicates + (event.crmDuplicates ?? 0),
              newLeads: already + (event.newLeads ?? event.validLeads ?? 0),
              leadCap: cap,
              nameRatePct: event.nameRatePct,
              nameDetectNamed: event.nameDetectNamed,
              nameDetectWithReviews: event.nameDetectWithReviews,
              websitePct: event.websitePct,
              noWebsitePct: event.noWebsitePct,
              withWebsite: event.withWebsite,
              noWebsite: event.noWebsite,
            });
            return;
          }
          emit(event);
        },
        activeProvider: () => activeProvider,
        acceptLead: isQualityLead,
        signal,
      });
      warnings.push(...collected.warnings);
      addSpend(spend, collected.spend);
      emitAll({ type: "log", message: formatSessionMixLog(sessionMix) });
      for (const lead of collected.leads) {
        const key = phoneKey(lead.phone);
        if (key) existingPhones.add(key);
        const web = websiteDedupKey(lead.website);
        if (web) existingWebsites.add(web);
        leads.push({ ...lead, index: leads.length + 1 });
      }
      if (collected.stopped) {
        paused = true;
        const latest = await loadCheckpoint();
        await saveCheckpoint({
          status: "paused",
          city: market.city,
          queryIndex: latest?.queryIndex ?? startQueryIndex,
          citiesDone: [...citiesDone],
          jobId,
        });
        emitAll({
          type: "log",
          message: `Paused in ${market.city}. After this computer starts, Canvass continues this city — it does not start over.`,
        });
        break;
      }
      const hitLeadCap = Boolean(cap && leads.length >= cap);
      if (shouldMarkCityDone({ stopped: false, hitLeadCap })) {
        citiesDone.add(market.city);
        await saveCheckpoint({
          status: "running",
          city: cities[i + 1]?.city || market.city,
          queryIndex: 0,
          citiesDone: [...citiesDone],
          jobId,
        });
      } else if (hitLeadCap) {
        emitAll({
          type: "log",
          message: `Saved ${cap} new shops. Next batch starts on its own. ${market.city} stays open.`,
        });
        break;
      }
      const next = cities.slice(i + 1).find((row) => !citiesDone.has(row.city));
      if (next) {
        emitAll({
          type: "log",
          message: `${market.city} done (${collected.leads.length} new). Continuing in ${next.city}.`,
        });
      }
    }

    if (paused) {
      emitAll({ type: "done", leads, warnings, csvFilename: "", paused: true });
      return;
    }

    if (lastParsed) {
      emitAll({
        type: "parsed",
        parsed: {
          ...lastParsed,
          city: cities.map((row) => row.city).join(" · "),
          targetCount: leads.length,
        },
      });
    }

    emitAll({ type: "step", step: 6, label: "Save to CRM" });
    spend.newLeads = leads.length;
    const cost = estimateCost(spend, leads.length);
    const spendLog = formatSpendLog(spend, cost);
    emitAll({ type: "log", message: spendLog });
    const csvFilename = leads.length ? await saveCsv(leads, { spend, cost }) : "";
    if (csvFilename) emitAll({ type: "log", message: `Saved spreadsheet as ${csvFilename}` });
    emitAll({
      type: "status",
      target: targetShown,
      validLeads: leads.length,
      remaining: 0,
      aiProvider: activeProvider,
      nextRequestInMs: 0,
      mapsPaidCalls: spend.mapsPaidCalls,
      mapsCacheHits: spend.mapsCacheHits,
      crmDuplicates: spend.crmDuplicates,
      newLeads: leads.length,
    });
    emitAll({ type: "done", leads, warnings, csvFilename, spendLog, hitLeadCap: Boolean(cap && leads.length >= cap) });
  } catch (err) {
    finishWithError(err, step, leads, warnings, emitAll);
  } finally {
    pool.stop();
    summaryPool?.stop();
  }
}
