import { prisma } from "@/shared/db";
import { getConfig } from "@/shared/settings";
import { geminiApiKeysFromEnv, prepareLeadImport, type GeminiImportReport } from "./gemini-import";
import {
  coerceRows,
  emptySkipReasons,
  parseCsv,
  type PreparedLead,
  type SkipReason,
  recheckPreparedLead,
} from "./import-rules";

export class LeadImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface LeadImportResponse {
  success: true;
  imported: number;
  skipped: number;
  wouldImport: number;
  summary: string;
  model: string | null;
  listSource: "angi" | "import";
  mapping: GeminiImportReport["mapping"] | null;
  adjustments: string[];
  skipReasons: Record<SkipReason | "duplicate_existing", number>;
  rowCount: number;
}

function skipReport(base: Record<SkipReason, number>, duplicateExisting: number) {
  return { ...base, duplicate_existing: duplicateExisting };
}

async function persistLeads(leads: PreparedLead[]) {
  let imported = 0;
  let duplicateExisting = 0;
  for (const lead of leads) {
    const existing = await prisma.lead.findUnique({ where: { phone: lead.phone }, select: { id: true } });
    if (existing) {
      duplicateExisting += 1;
      continue;
    }
    try {
      await prisma.lead.create({
        data: {
          phone: lead.phone,
          businessName: lead.businessName,
          name: lead.name,
          email: lead.email,
          city: lead.city,
          state: lead.state,
          address: lead.address,
          website: lead.website,
          googleMapsUrl: lead.googleMapsUrl,
          source: lead.source,
          status: "new",
        },
      });
      imported += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("unique")) {
        duplicateExisting += 1;
        continue;
      }
      throw err;
    }
  }
  return { imported, duplicateExisting };
}

function filenameFrom(body: Record<string, unknown>) {
  return typeof body.filename === "string" ? body.filename : "";
}

/**
 * Every raw CSV/JSON/API import calls Gemini before filters run.
 * A CLI that already called Gemini can POST `{ prepared: true, ... }` and the
 * same filters run again here. Existing phones are not overwritten.
 */
export async function runLeadImport(body: unknown): Promise<LeadImportResponse> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new LeadImportError("JSON body required");
  }
  const record = body as Record<string, unknown>;

  if (record.prepared === true) {
    return persistPrepared(record);
  }

  const rows = rowsFromBody(record);
  if (!rows.length) throw new LeadImportError("No lead rows found. Send { csv } or { leads: [...] }.");

  const cfg = await getConfig();
  const apiKeys = [...new Set([cfg.GEMINI_API_KEY, ...geminiApiKeysFromEnv()].map((key) => key.trim()).filter(Boolean))];
  let report: GeminiImportReport;
  try {
    report = await prepareLeadImport(rows, {
      apiKeys,
      filename: filenameFrom(record),
      model: cfg.GEMINI_MODEL || process.env.GEMINI_MODEL || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini lead mapping failed";
    const status = /not configured/i.test(message) ? 400 : 502;
    throw new LeadImportError(message, status);
  }

  const saved = await persistLeads(report.leads);
  const skipped = report.skipped + saved.duplicateExisting;
  return {
    success: true,
    imported: saved.imported,
    skipped,
    wouldImport: report.wouldImport,
    summary: report.summary,
    model: report.model,
    listSource: report.listSource,
    mapping: report.mapping,
    adjustments: report.adjustments,
    skipReasons: skipReport(report.skipReasons, saved.duplicateExisting),
    rowCount: report.rowCount,
  };
}

function rowsFromBody(body: Record<string, unknown>): Record<string, string>[] {
  if (typeof body.csv === "string" && body.csv.trim()) return parseCsv(body.csv);
  if (Array.isArray(body.leads)) return coerceRows(body.leads);
  if (Array.isArray(body.rows)) return coerceRows(body.rows);
  if (Array.isArray(body.records)) return coerceRows(body.records);
  return [];
}

async function persistPrepared(body: Record<string, unknown>): Promise<LeadImportResponse> {
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary || !body.mapping || typeof body.mapping !== "object") {
    throw new LeadImportError("Prepared imports must include the Gemini summary and column mapping.");
  }
  const incoming = Array.isArray(body.leads) ? body.leads : [];
  const skipReasons = emptySkipReasons();
  const accepted: PreparedLead[] = [];
  const seen = new Set<string>();
  for (const item of incoming) {
    const checked = recheckPreparedLead(item);
    if (!checked.ok) {
      skipReasons[checked.reason] += 1;
      continue;
    }
    if (seen.has(checked.lead.phone)) {
      skipReasons.duplicate_phone += 1;
      continue;
    }
    seen.add(checked.lead.phone);
    accepted.push(checked.lead);
  }

  const saved = await persistLeads(accepted);
  const filterSkipped = Object.values(skipReasons).reduce((sum, count) => sum + count, 0);
  const listSource = body.listSource === "angi" || accepted.some((lead) => lead.source === "angi") ? "angi" : "import";
  return {
    success: true,
    imported: saved.imported,
    skipped: filterSkipped + saved.duplicateExisting,
    wouldImport: accepted.length,
    summary,
    model: typeof body.model === "string" ? body.model : null,
    listSource,
    mapping: body.mapping as GeminiImportReport["mapping"],
    adjustments: Array.isArray(body.adjustments) ? body.adjustments.map((item) => String(item)) : [],
    skipReasons: skipReport(skipReasons, saved.duplicateExisting),
    rowCount: typeof body.rowCount === "number" ? body.rowCount : incoming.length,
  };
}

