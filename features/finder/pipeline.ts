import { saveCsv } from "@/features/finder/csv";
import { createAiPool } from "@/features/finder/llm";
import { collectValidLeads } from "@/features/finder/collect";
import { assertReady, loadSettings } from "@/features/finder/settings";
import type { PipelineEvent } from "@/features/finder/types";
import { parseRequest } from "@/features/finder/workflows/parseRequest";
import { prisma } from "@/shared/db";
import { phoneKey } from "@/features/finder/valid";

async function loadExistingPhones(): Promise<Set<string>> {
  try {
    const rows = await prisma.lead.findMany({ select: { phone: true } });
    const keys = new Set<string>();
    for (const row of rows) {
      const key = phoneKey(row.phone);
      if (key) keys.add(key);
    }
    return keys;
  } catch {
    return new Set();
  }
}

export async function runPipeline(
  userPrompt: string,
  emit: (event: PipelineEvent) => void,
): Promise<void> {
  const settings = await loadSettings();
  assertReady(settings);
  const warnings: string[] = [];
  let activeProvider = "waiting";
  let lastStatus = {
    target: 0,
    validLeads: 0,
    remaining: 0,
    aiProvider: "waiting",
    nextRequestInMs: 0,
  };

  const emitAll = (event: PipelineEvent) => {
    if (event.type === "status") {
      lastStatus = {
        target: event.target ?? lastStatus.target,
        validLeads: event.validLeads ?? lastStatus.validLeads,
        remaining:
          event.remaining ??
          Math.max(
            0,
            (event.target ?? lastStatus.target) - (event.validLeads ?? lastStatus.validLeads),
          ),
        aiProvider: event.aiProvider ?? lastStatus.aiProvider,
        nextRequestInMs: event.nextRequestInMs ?? lastStatus.nextRequestInMs,
      };
      emit({ type: "status", ...lastStatus });
      return;
    }
    emit(event);
  };

  const pool = createAiPool(settings, (status) => {
    activeProvider = status.provider;
    emitAll({
      type: "status",
      aiProvider: status.provider,
      nextRequestInMs: status.nextRequestInMs,
    });
  });

  try {
    emitAll({ type: "step", step: 1, label: "Understand the request" });
    emitAll({ type: "log", message: "Reading your request with Gemini…" });
    const parsed = await parseRequest({
      prompt: userPrompt,
      apiKey: settings.GEMINI_API_KEY,
      model: settings.GEMINI_MODEL,
    });
    emitAll({ type: "parsed", parsed });
    emitAll({
      type: "log",
      message: `Target is ${parsed.targetCount} valid processed ${parsed.businessType} in ${parsed.city}${
        parsed.maxReviews !== null ? `, under ${parsed.maxReviews} reviews` : ""
      }, website: ${parsed.websitePreference}. Duplicate, filter-fail, and AI-fail rows do not count.`,
    });
    emitAll({
      type: "status",
      target: parsed.targetCount,
      validLeads: 0,
      remaining: parsed.targetCount,
      aiProvider: activeProvider,
      nextRequestInMs: 0,
    });

    const existingPhones = await loadExistingPhones();
    const collected = await collectValidLeads({
      parsed,
      settings,
      pool,
      existingPhones,
      emit: emitAll,
      activeProvider: () => activeProvider,
    });
    warnings.push(...collected.warnings);

    emitAll({ type: "step", step: 6, label: "Build the outreach list" });
    const csvFilename = collected.leads.length ? await saveCsv(collected.leads) : "";
    if (csvFilename) emitAll({ type: "log", message: `Saved spreadsheet as ${csvFilename}` });
    emitAll({ type: "done", leads: collected.leads, warnings, csvFilename });
  } catch (err) {
    emitAll({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    pool.stop();
  }
}
