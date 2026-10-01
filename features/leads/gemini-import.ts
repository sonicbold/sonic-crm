import {
  applyImportRules,
  type CrmImportField,
  CRM_IMPORT_FIELDS,
  detectAngiList,
  headersOf,
  type ImportFilterResult,
  type ListSource,
  type MappedColumns,
  type PreparedLead,
  resolveListSource,
  sanitizeMapping,
} from "./import-rules";

const MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];

export interface GeminiImportReport {
  summary: string;
  model: string;
  listSource: ListSource;
  mapping: MappedColumns;
  adjustments: string[];
  rowCount: number;
  wouldImport: number;
  skipped: number;
  skipReasons: ImportFilterResult["skipReasons"];
  leads: PreparedLead[];
  angiEvidence: boolean;
}

interface GeminiMappingResponse {
  summary?: unknown;
  listSource?: unknown;
  columns?: Partial<Record<CrmImportField, unknown>>;
}

function extractJson(text: string): GeminiMappingResponse {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini did not return JSON");
  return JSON.parse(raw.slice(start, end + 1)) as GeminiMappingResponse;
}

function redact(message: string, secrets: string[]) {
  let out = message;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

function columnExamples(rows: Record<string, string>[], headers: string[]) {
  return headers.map((header) => {
    const examples: string[] = [];
    const seen = new Set<string>();
    let empty = 0;
    for (const row of rows) {
      const value = (row[header] || "").replace(/\s+/g, " ").trim();
      if (!value) {
        empty += 1;
        continue;
      }
      if (seen.has(value)) continue;
      seen.add(value);
      if (examples.length < 4) examples.push(value.slice(0, 110));
    }
    return { header, empty, nonempty: rows.length - empty, examples };
  });
}

function representativeRows(rows: Record<string, string>[], headers: string[]) {
  const picked: Record<string, string>[] = [];
  const seen = new Set<number>();
  const take = (index: number) => {
    if (index < 0 || index >= rows.length || seen.has(index) || picked.length >= 8) return;
    seen.add(index);
    const compact: Record<string, string> = {};
    for (const header of headers) {
      const value = (rows[index][header] || "").replace(/\s+/g, " ").trim();
      if (value) compact[header] = value.slice(0, 140);
    }
    picked.push(compact);
  };

  take(0);
  take(1);
  take(Math.min(2, rows.length - 1));
  const website = headers.find((header) => /^website$/i.test(header));
  const owner = headers.find((header) => /owner|contact/i.test(header));
  const city = headers.find((header) => /^city$/i.test(header));
  if (website) take(rows.findIndex((row) => (row[website] || "").trim()));
  if (owner) take(rows.findIndex((row) => (row[owner] || "").trim()));
  if (city) take(rows.findIndex((row) => !(row[city] || "").trim()));
  for (let index = 0; index < rows.length && picked.length < 8; index++) take(index);
  return picked;
}

function mappingPrompt(rows: Record<string, string>[], headers: string[], filename: string, correction?: string) {
  const examples = columnExamples(rows, headers);
  const samples = representativeRows(rows, headers);
  return `You map one lead-list file onto Sonic CRM fields. Do not invent owner names, phones, cities, or URLs. Do not fill empty cells. Only name headers that appear in the header list.

CRM fields:
- company: the business name column
- website: the column that contains the business website URL when one exists. Not an Angi, Facebook, Yelp, or Google URL.
- websiteStatus: a column that explicitly says the website is missing or not found (values like "not_found", "no_website", "no website", "no link"). Notes or score columns count when they literally contain that phrase. Null if nothing explicit exists.
- gbp: a Google Maps URL column only. Null if the file has no Google Maps links.
- contact: the owner or person column only. Null when the file has no owner/contact column. Never select the business-name column.
- phone: the phone column
- email: the email column, or null
- city: the business's own city. Never select search_city / "Search City" / a search metro when a business city column exists. Map the business city column even if some cells are empty.
- address: street or address column. Not the search metro.
- state: business state column, or null
- sourceColumn: column whose cell value is the lead source, or null

listSource is "angi" only when the file is an Angi export. Otherwise "import".
summary is 2-4 sentences about this file, using the row count and the column examples. Do not name businesses that are not in the samples.

Return JSON only:
{"summary":"...","listSource":"angi"|"import","columns":{"company":null,"website":null,"websiteStatus":null,"gbp":null,"contact":null,"phone":null,"email":null,"city":null,"address":null,"state":null,"sourceColumn":null}}

File name: ${filename || "(unnamed)"}
Row count: ${rows.length}
Headers: ${JSON.stringify(headers)}
Column examples: ${JSON.stringify(examples)}
Sample rows: ${JSON.stringify(samples)}
${correction ? `\nFix this and answer again:\n${correction}` : ""}`;
}

export function geminiApiKeysFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const keys: string[] = [];
  const named = Object.keys(env)
    .filter((name) => /^GEMINI_API_KEY/.test(name))
    .sort();
  for (const name of named) {
    const value = (env[name] || "").trim();
    if (value && !keys.includes(value)) keys.push(value);
  }
  return keys;
}

async function generateMapping(prompt: string, apiKeys: string[], modelHint?: string): Promise<{ parsed: GeminiMappingResponse; model: string }> {
  const models = [...(modelHint ? [modelHint] : []), ...MODELS.filter((model) => model !== modelHint)];
  const failures: string[] = [];

  for (const apiKey of apiKeys) {
    for (let index = 0; index < models.length; index++) {
      const model = models[index];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            },
          }),
        });
      } catch (err) {
        failures.push(redact(err instanceof Error ? err.message : String(err), apiKeys));
        continue;
      }

      const bodyText = await res.text();
      if (!res.ok) {
        failures.push(redact(`Gemini ${model} failed (${res.status}): ${bodyText.slice(0, 180)}`, apiKeys));
        const suggested = bodyText.match(/models\/([a-z0-9.\-]+)/i)?.[1];
        if (suggested && !models.includes(suggested)) models.push(suggested);
        if (res.status === 401 || res.status === 403) break;
        continue;
      }

      let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      try {
        data = JSON.parse(bodyText) as typeof data;
      } catch {
        lastError = `Gemini ${model} returned a non-JSON HTTP body`;
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      if (!text.trim()) {
        lastError = `Empty Gemini response from ${model}`;
        continue;
      }
      try {
        return { parsed: extractJson(text), model };
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  throw new Error(failures.slice(-4).join(" | ") || "Gemini request failed");
}

function proposedColumns(parsed: GeminiMappingResponse): Partial<MappedColumns> {
  const columns: Partial<MappedColumns> = {};
  const raw = parsed.columns || {};
  for (const field of CRM_IMPORT_FIELDS) {
    const value = raw[field];
    columns[field] = typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return columns;
}

export async function prepareLeadImport(
  rows: Record<string, string>[],
  options: { apiKeys: string[]; filename?: string; model?: string },
): Promise<GeminiImportReport> {
  const apiKeys = [...new Set(options.apiKeys.map((key) => key.trim()).filter(Boolean))];
  if (!apiKeys.length) {
    throw new Error("GEMINI_API_KEY is not configured. Add it in Settings or export GEMINI_API_KEY before importing.");
  }
  if (!rows.length) throw new Error("The lead list is empty.");

  const headers = headersOf(rows);
  const filename = options.filename || "";
  let correction: string | undefined;
  let last: { parsed: GeminiMappingResponse; model: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    last = await generateMapping(mappingPrompt(rows, headers, filename, correction), apiKeys, options.model);
    const proposed = proposedColumns(last.parsed);
    if (proposed.company && proposed.phone) break;
    correction = "company and phone must be exact headers from the file. They were missing or not real headers.";
  }
  if (!last) throw new Error("Gemini did not map the lead list.");

  const sanitized = sanitizeMapping(proposedColumns(last.parsed), headers, rows);
  if (!sanitized.columns.company || !sanitized.columns.phone) {
    throw new Error("Gemini could not map a business-name column and a phone column. Import stopped before any rows were written.");
  }

  const listSource = resolveListSource(last.parsed.listSource, rows, headers, filename);
  const filtered = applyImportRules(rows, sanitized.columns, listSource);
  const summary = String(last.parsed.summary || "").replace(/\s+/g, " ").trim().slice(0, 900)
    || `${rows.length} lead rows mapped with Gemini.`;

  return {
    summary,
    model: last.model,
    listSource,
    mapping: sanitized.columns,
    adjustments: sanitized.adjustments,
    rowCount: rows.length,
    wouldImport: filtered.leads.length,
    skipped: filtered.skipped,
    skipReasons: filtered.skipReasons,
    leads: filtered.leads,
    angiEvidence: detectAngiList(rows, headers, filename),
  };
}
