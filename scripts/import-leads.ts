import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { geminiApiKeysFromEnv, prepareLeadImport } from "../features/leads/gemini-import";
import { coerceRows, parseCsv } from "../features/leads/import-rules";

function usage() {
  return `Gemini lead import (summarize → map columns → strict filter → optional POST)

  npm run import:leads -- --dry-run ./leads.csv
  npm run import:leads -- --post http://localhost:3000 ./leads.csv

--dry-run   Call Gemini, map columns, print import/skip counts. Does not write.
--post URL  After the same Gemini map and filter, POST qualifying leads to URL/api/leads/import.
--json      Print the machine-readable report on stdout.

The CRM must already be running for --post. This command reads GEMINI_API_KEY
(and GEMINI_API_KEY_2, GEMINI_API_KEY_*, GEMINI_MODEL) from the environment.
It does not read or write secret files.`;
}

function argValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  if (index < 0) return "";
  return argv[index + 1] || "";
}

function loadRows(file: string): Record<string, string>[] {
  const text = readFileSync(file, "utf8");
  if (file.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return coerceRows(parsed);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return coerceRows(record.leads ?? record.rows ?? record.records);
    }
    return [];
  }
  return parseCsv(text);
}

function importEndpoint(base: string) {
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/api/leads/import")) return trimmed;
  return `${trimmed}/api/leads/import`;
}

function printReport(report: {
  summary: string;
  model: string | null;
  listSource: string;
  mapping: Record<string, string | null>;
  adjustments: string[];
  rowCount: number;
  wouldImport: number;
  skipped: number;
  skipReasons: Record<string, number>;
  dryRun?: boolean;
  imported?: number;
}) {
  const lines = [
    report.dryRun ? "Dry run — nothing was posted or written." : `Imported ${report.imported ?? 0}.`,
    `Summary: ${report.summary}`,
    `Model: ${report.model || "(none)"}`,
    `Source: ${report.listSource}`,
    `Rows: ${report.rowCount}`,
    `Pass filter: ${report.wouldImport}`,
    `Skipped by rules: ${report.skipped}`,
  ];
  for (const [reason, count] of Object.entries(report.skipReasons)) {
    if (count) lines.push(`  ${reason}: ${count}`);
  }
  lines.push("Mapping:");
  for (const [field, header] of Object.entries(report.mapping)) {
    lines.push(`  ${field} ← ${header || "(none)"}`);
  }
  if (report.adjustments.length) {
    lines.push("Mapping adjustments:");
    for (const adjustment of report.adjustments) lines.push(`  ${adjustment}`);
  }
  console.log(lines.join("\n"));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const dryRun = argv.includes("--dry-run") || !argv.includes("--post");
  const post = argValue(argv, "--post");
  const asJson = argv.includes("--json");
  const file = argv.filter((arg, index) => {
    if (arg.startsWith("--")) return false;
    const prev = argv[index - 1];
    return prev !== "--post";
  })[0];

  if (!file) {
    console.error(usage());
    process.exit(1);
  }
  if (!dryRun && !post) {
    console.error("Pass --dry-run or --post http://localhost:3000");
    process.exit(1);
  }

  const rows = loadRows(file);
  const apiKeys = geminiApiKeysFromEnv();
  const report = await prepareLeadImport(rows, {
    apiKeys,
    filename: basename(file),
    model: process.env.GEMINI_MODEL || undefined,
  });

  if (dryRun || !post) {
    const payload = { ...report, leads: undefined, dryRun: true };
    if (asJson) console.log(JSON.stringify({ ...report, leads: report.leads.length, dryRun: true }, null, 2));
    else printReport({ ...payload, dryRun: true });
    return;
  }

  const res = await fetch(importEndpoint(post), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prepared: true,
      summary: report.summary,
      model: report.model,
      listSource: report.listSource,
      mapping: report.mapping,
      adjustments: report.adjustments,
      rowCount: report.rowCount,
      leads: report.leads,
    }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === "string" ? data.error : `Import failed (${res.status})`;
    throw new Error(message);
  }
  if (asJson) console.log(JSON.stringify(data, null, 2));
  else {
    printReport({
      summary: String(data.summary || report.summary),
      model: typeof data.model === "string" ? data.model : report.model,
      listSource: String(data.listSource || report.listSource),
      mapping: (data.mapping && typeof data.mapping === "object" ? data.mapping : report.mapping) as Record<string, string | null>,
      adjustments: Array.isArray(data.adjustments) ? data.adjustments.map(String) : report.adjustments,
      rowCount: Number(data.rowCount || report.rowCount),
      wouldImport: Number(data.wouldImport || report.wouldImport),
      skipped: Number(data.skipped || 0),
      skipReasons: (data.skipReasons && typeof data.skipReasons === "object" ? data.skipReasons : report.skipReasons) as Record<string, number>,
      imported: Number(data.imported || 0),
      dryRun: false,
    });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
