import { ensureE164 } from "../../shared/utils";

/** CRM columns the leads table shows, plus the location fields those rows require. */
export const CRM_IMPORT_FIELDS = [
  "company",
  "website",
  "websiteStatus",
  "gbp",
  "contact",
  "phone",
  "email",
  "city",
  "address",
  "state",
  "sourceColumn",
] as const;

export type CrmImportField = (typeof CRM_IMPORT_FIELDS)[number];

export type MappedColumns = Record<CrmImportField, string | null>;

export type ListSource = "angi" | "import";

export type SkipReason =
  | "missing_company"
  | "invalid_phone"
  | "toll_free"
  | "missing_location"
  | "website_status_unknown"
  | "duplicate_phone";

export interface PreparedLead {
  businessName: string;
  name: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  website: string;
  websiteStatus: "url" | "none";
  googleMapsUrl: string | null;
  source: ListSource;
  status: "new";
}

export interface ImportFilterResult {
  leads: PreparedLead[];
  skipped: number;
  skipReasons: Record<SkipReason, number>;
}

const TOLL_FREE_NPA = new Set(["800", "833", "844", "855", "866", "877", "888"]);

const EMPTY_TOKENS = /^(n\/a|na|none|null|unknown|n\.a\.|-|—|–)$/i;

export function emptySkipReasons(): Record<SkipReason, number> {
  return {
    missing_company: 0,
    invalid_phone: 0,
    toll_free: 0,
    missing_location: 0,
    website_status_unknown: 0,
    duplicate_phone: 0,
  };
}

export function blankMappedColumns(): MappedColumns {
  return {
    company: null,
    website: null,
    websiteStatus: null,
    gbp: null,
    contact: null,
    phone: null,
    email: null,
    city: null,
    address: null,
    state: null,
    sourceColumn: null,
  };
}

/** RFC-style CSV. Keeps the header text Gemini needs to see, including case. */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) table.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) table.push(row);
  }
  if (!table.length) return [];

  const headers = table[0].map((header) => header.trim());
  const records: Record<string, string>[] = [];
  for (const cells of table.slice(1)) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = (cells[index] ?? "").trim();
    });
    if (Object.values(record).some((value) => value)) records.push(record);
  }
  return records;
}

export function headersOf(rows: Record<string, string>[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
    }
  }
  return headers;
}

export function resolveHeader(headers: string[], wanted: string | null | undefined): string | null {
  if (!wanted) return null;
  const trimmed = wanted.trim();
  if (!trimmed) return null;
  return headers.find((header) => header === trimmed)
    ?? headers.find((header) => header.toLowerCase() === trimmed.toLowerCase())
    ?? null;
}

export function explicitNoWebsiteMarker(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (EMPTY_TOKENS.test(text) || /^(no link|no website|no_website|no-website|not found|not_found|without website|without a website)$/i.test(text)) {
    return true;
  }
  return /not[_\s-]?found|no[_\s-]?website|no[_\s-]?link|without\s+a?\s*website/i.test(text);
}

export function extractHttpUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return match[0].replace(/[),.;]+$/, "");
}

export function isBusinessWebsiteUrl(value: string): boolean {
  const url = extractHttpUrl(value);
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || host === "localhost") return false;
    if (
      /(^|\.)angi\.com$|(^|\.)homeadvisor\.com$|(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)instagram\.com$|(^|\.)yelp\.com$|(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$|(^|\.)g\.co$|(^|\.)maps\.app\.goo\.gl$/.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isMapsUrl(value: string): boolean {
  const url = extractHttpUrl(value) || value.trim();
  return /google\.[^/\s]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(url);
}

export function nationalNanp(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

export function isTollFreePhone(phone: string): boolean {
  const national = nationalNanp(phone);
  if (!national) return false;
  return TOLL_FREE_NPA.has(national.slice(0, 3));
}

export function toImportPhone(phone: string): { ok: true; e164: string } | { ok: false; reason: "invalid_phone" | "toll_free" } {
  const national = nationalNanp(phone);
  if (national) {
    if (TOLL_FREE_NPA.has(national.slice(0, 3))) return { ok: false, reason: "toll_free" };
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return { ok: false, reason: "invalid_phone" };
    return { ok: true, e164: `+1${national}` };
  }
  const e164 = ensureE164(phone);
  if (!/^\+[1-9]\d{9,14}$/.test(e164)) return { ok: false, reason: "invalid_phone" };
  return { ok: true, e164 };
}

function cleanToken(value: string | null | undefined, max: number): string | null {
  const trimmed = (value || "").trim().replace(/\s+/g, " ");
  if (!trimmed || EMPTY_TOKENS.test(trimmed)) return null;
  return trimmed.slice(0, max);
}

function cleanCity(value: string | null | undefined): string | null {
  const city = cleanToken(value, 80);
  if (!city || /^located in:?$/i.test(city)) return null;
  return city;
}

function cleanAddress(value: string | null | undefined): string | null {
  const address = cleanToken(value, 300);
  if (!address || /^located in:?$/i.test(address)) return null;
  return address;
}

function cell(row: Record<string, string>, header: string | null): string {
  if (!header) return "";
  return (row[header] ?? "").trim();
}

function headerByPattern(headers: string[], pattern: RegExp): string | null {
  return headers.find((header) => pattern.test(header)) ?? null;
}

function columnHasBusinessUrl(rows: Record<string, string>[], header: string | null): boolean {
  if (!header) return false;
  return rows.some((row) => isBusinessWebsiteUrl(row[header] || ""));
}

function columnHasMapsUrl(rows: Record<string, string>[], header: string | null): boolean {
  if (!header) return false;
  return rows.some((row) => isMapsUrl(row[header] || ""));
}

function isSearchLocationHeader(header: string | null): boolean {
  return !!header && /search[_\s-]?(city|location|metro)/i.test(header);
}

function isOwnerHeader(header: string | null): boolean {
  return !!header && /^(owner([_\s-]?name)?|contact([_\s-]?name)?|proprietor|decision[_\s-]?maker)$/i.test(header);
}

/**
 * Gemini names the columns. This only drops mappings that would invent a contact,
 * treat a search metro as the shop city, or store an Angi/Facebook URL as the website,
 * then fills a required column Gemini left blank when the header is unambiguous.
 */
export function sanitizeMapping(
  proposed: Partial<MappedColumns>,
  headers: string[],
  rows: Record<string, string>[],
): { columns: MappedColumns; adjustments: string[] } {
  const adjustments: string[] = [];
  const columns = blankMappedColumns();

  for (const field of CRM_IMPORT_FIELDS) {
    const resolved = resolveHeader(headers, proposed[field]);
    if (proposed[field] && !resolved) {
      adjustments.push(`${field}: ignored unknown column ${JSON.stringify(proposed[field])}`);
    }
    columns[field] = resolved;
  }

  if (isSearchLocationHeader(columns.city)) {
    const businessCity = headerByPattern(headers, /^(city|business city)$/i);
    adjustments.push(`city: ignored ${columns.city}; ${businessCity ? `using ${businessCity}` : "search metro is not the shop location"}`);
    columns.city = businessCity;
  }
  if (isSearchLocationHeader(columns.address)) {
    adjustments.push(`address: ignored ${columns.address}`);
    columns.address = headerByPattern(headers, /^(address|street|street address)$/i);
  }

  if (columns.contact && (columns.contact === columns.company || !isOwnerHeader(columns.contact))) {
    const owner = headerByPattern(headers, /^(owner([_\s-]?name)?|contact([_\s-]?name)?|contact person)$/i);
    adjustments.push(`contact: ignored ${columns.contact}; owner names are not inferred from the business`);
    columns.contact = owner && owner !== columns.company ? owner : null;
  }

  if (columns.website && !columnHasBusinessUrl(rows, columns.website)) {
    const website = headerByPattern(headers, /^(website|web site|site url)$/i);
    if (website && columnHasBusinessUrl(rows, website)) {
      adjustments.push(`website: ignored ${columns.website}; using ${website}`);
      columns.website = website;
    } else if (columns.website && /facebook|source_url|angi/i.test(columns.website)) {
      adjustments.push(`website: ignored ${columns.website}; listing URLs are not the business website`);
      columns.website = null;
    }
  }

  if (columns.gbp && !columnHasMapsUrl(rows, columns.gbp)) {
    const maps = headerByPattern(headers, /google\s*maps|^gbp$|maps url/i);
    adjustments.push(`gbp: ignored ${columns.gbp}; ${maps && columnHasMapsUrl(rows, maps) ? `using ${maps}` : "no Google Maps URL column"}`);
    columns.gbp = maps && columnHasMapsUrl(rows, maps) ? maps : null;
  }

  const hints: { field: CrmImportField; pattern: RegExp }[] = [
    { field: "company", pattern: /^(business name|company name|company|business)$/i },
    { field: "company", pattern: /^name$/i },
    { field: "phone", pattern: /^(phone|phone number|mobile|telephone)$/i },
    { field: "website", pattern: /^(website|web site|site url)$/i },
    { field: "websiteStatus", pattern: /website[_\s-]?(found[_\s-]?via|status)|site[_\s-]?status/i },
    { field: "gbp", pattern: /google\s*maps|^gbp$|maps url/i },
    { field: "contact", pattern: /^(owner([_\s-]?name)?|contact([_\s-]?name)?|contact person)$/i },
    { field: "email", pattern: /^(email|e-mail)$/i },
    { field: "city", pattern: /^(city|business city)$/i },
    { field: "address", pattern: /^(address|street|street address)$/i },
    { field: "state", pattern: /^(state)$/i },
    { field: "sourceColumn", pattern: /^(source|sources)$/i },
  ];

  for (const hint of hints) {
    if (columns[hint.field]) continue;
    const header = headerByPattern(headers, hint.pattern);
    if (!header) continue;
    if (hint.field === "company" && columns.company) continue;
    if (hint.field === "contact" && header === columns.company) continue;
    if (hint.field === "gbp" && !columnHasMapsUrl(rows, header)) continue;
    if (hint.field === "city" && isSearchLocationHeader(header)) continue;
    columns[hint.field] = header;
    adjustments.push(`${hint.field}: Gemini left this blank; using ${header}`);
  }

  if (!columns.websiteStatus) {
    const notes = headers.find((header) =>
      /^(notes|score[_\s-]?reasons)$|website[_\s-]?found|website[_\s-]?status/i.test(header)
      && rows.some((row) => explicitNoWebsiteMarker(row[header] || "")),
    );
    if (notes) {
      columns.websiteStatus = notes;
      adjustments.push(`websiteStatus: using ${notes} because it explicitly marks no_website / not_found`);
    }
  }

  if (!columns.company) {
    const name = headerByPattern(headers, /^name$/i);
    if (name) {
      columns.company = name;
      adjustments.push("company: using name");
    }
  }

  return { columns, adjustments };
}

export function detectAngiList(rows: Record<string, string>[], headers: string[], filename = ""): boolean {
  if (/angi/i.test(filename)) return true;
  if (headers.some((header) => /angi/i.test(header))) return true;
  const source = headers.find((header) => /^(source|sources)$/i.test(header));
  if (source && rows.some((row) => /\bangi\b/i.test(row[source] || ""))) return true;
  return rows.some((row) => Object.values(row).some((value) => /angi\.com/i.test(value)));
}

export function resolveListSource(
  geminiSource: unknown,
  rows: Record<string, string>[],
  headers: string[],
  filename = "",
): ListSource {
  if (detectAngiList(rows, headers, filename)) return "angi";
  return String(geminiSource || "").toLowerCase().includes("angi") ? "angi" : "import";
}

function websiteDecision(websiteRaw: string, statusRaw: string):
  | { ok: true; website: string; websiteStatus: "url" | "none" }
  | { ok: false } {
  const url = extractHttpUrl(websiteRaw);
  if (url && isBusinessWebsiteUrl(url)) {
    return { ok: true, website: url, websiteStatus: "url" };
  }
  if (explicitNoWebsiteMarker(websiteRaw) || explicitNoWebsiteMarker(statusRaw)) {
    return { ok: true, website: "No link", websiteStatus: "none" };
  }
  return { ok: false };
}

export function applyImportRules(
  rows: Record<string, string>[],
  columns: MappedColumns,
  listSource: ListSource,
): ImportFilterResult {
  const skipReasons = emptySkipReasons();
  const leads: PreparedLead[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const businessName = cleanToken(cell(row, columns.company), 200);
    if (!businessName) {
      skipReasons.missing_company += 1;
      continue;
    }

    const phone = toImportPhone(cell(row, columns.phone));
    if (!phone.ok) {
      skipReasons[phone.reason] += 1;
      continue;
    }
    if (seen.has(phone.e164)) {
      skipReasons.duplicate_phone += 1;
      continue;
    }

    const city = cleanCity(cell(row, columns.city));
    const address = cleanAddress(cell(row, columns.address));
    if (!city && !address) {
      skipReasons.missing_location += 1;
      continue;
    }

    const website = websiteDecision(cell(row, columns.website), cell(row, columns.websiteStatus));
    if (!website.ok) {
      skipReasons.website_status_unknown += 1;
      continue;
    }

    const contact = cleanToken(cell(row, columns.contact), 120);
    const mapsRaw = cell(row, columns.gbp);
    const googleMapsUrl = isMapsUrl(mapsRaw) ? (extractHttpUrl(mapsRaw) || mapsRaw) : null;
    const emailRaw = cell(row, columns.email);
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    const state = cleanToken(cell(row, columns.state), 40);
    const sourceCell = cell(row, columns.sourceColumn);
    const source: ListSource = listSource === "angi" || /\bangi\b/i.test(sourceCell) ? "angi" : "import";

    seen.add(phone.e164);
    leads.push({
      businessName,
      name: contact,
      phone: phone.e164,
      email,
      city,
      state,
      address,
      website: website.website,
      websiteStatus: website.websiteStatus,
      googleMapsUrl,
      source,
      status: "new",
    });
  }

  const skipped = Object.values(skipReasons).reduce((sum, count) => sum + count, 0);
  return { leads, skipped, skipReasons };
}

/** Second gate for rows that already went through Gemini, so POST cannot widen the rules. */
export function recheckPreparedLead(input: unknown): { ok: true; lead: PreparedLead } | { ok: false; reason: SkipReason } {
  if (!input || typeof input !== "object") return { ok: false, reason: "missing_company" };
  const row = input as Record<string, unknown>;
  const businessName = cleanToken(typeof row.businessName === "string" ? row.businessName : "", 200);
  if (!businessName) return { ok: false, reason: "missing_company" };

  const phone = toImportPhone(typeof row.phone === "string" ? row.phone : "");
  if (!phone.ok) return { ok: false, reason: phone.reason };

  const city = cleanCity(typeof row.city === "string" ? row.city : "");
  const address = cleanAddress(typeof row.address === "string" ? row.address : "");
  if (!city && !address) return { ok: false, reason: "missing_location" };

  const websiteRaw = typeof row.website === "string" ? row.website : "";
  const website = websiteDecision(websiteRaw, typeof row.websiteStatus === "string" ? row.websiteStatus : "");
  if (!website.ok) return { ok: false, reason: "website_status_unknown" };

  const name = cleanToken(typeof row.name === "string" ? row.name : "", 120);
  const emailRaw = typeof row.email === "string" ? row.email.trim() : "";
  const mapsRaw = typeof row.googleMapsUrl === "string" ? row.googleMapsUrl : "";
  const source: ListSource = row.source === "angi" || (typeof row.source === "string" && /\bangi\b/i.test(row.source)) ? "angi" : "import";

  return {
    ok: true,
    lead: {
      businessName,
      name,
      phone: phone.e164,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null,
      city,
      state: cleanToken(typeof row.state === "string" ? row.state : "", 40),
      address,
      website: website.website,
      websiteStatus: website.websiteStatus,
      googleMapsUrl: isMapsUrl(mapsRaw) ? (extractHttpUrl(mapsRaw) || mapsRaw) : null,
      source,
      status: "new",
    },
  };
}

export function coerceRows(value: unknown): Record<string, string>[] {
  if (!Array.isArray(value)) return [];
  const rows: Record<string, string>[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record: Record<string, string> = {};
    for (const [key, cellValue] of Object.entries(item as Record<string, unknown>)) {
      if (!key.trim()) continue;
      if (cellValue == null) record[key] = "";
      else if (typeof cellValue === "string" || typeof cellValue === "number" || typeof cellValue === "boolean") {
        record[key] = String(cellValue).trim();
      }
    }
    if (Object.values(record).some((cellValue) => cellValue)) rows.push(record);
  }
  return rows;
}
