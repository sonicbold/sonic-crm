import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Lead } from "./types";

function cell(value: string): string {
  const v = value.replace(/\r?\n/g, " ").trim();
  if (/[",]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function leadsToCsv(leads: Lead[]): string {
  const header = [
    "#",
    "Owner Name",
    "Business Name",
    "Phone",
    "Location",
    "Website",
    "Google Profile",
    "Review Summary",
    "Review Count",
    "Note",
  ];
  const rows = leads.map((lead) =>
    [
      String(lead.index),
      lead.ownerName,
      lead.businessName,
      lead.phone,
      lead.location,
      lead.website,
      lead.profileUrl || "No link",
      lead.summary,
      String(lead.reviewsCount),
      lead.note ?? "",
    ]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export async function saveCsv(leads: Lead[]): Promise<string> {
  const dir = path.join(process.cwd(), "data", "exports");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `leads-${stamp}.csv`;
  await writeFile(path.join(dir, filename), leadsToCsv(leads), "utf8");
  return filename;
}
