import { prisma } from "@/shared/db";

const KEY = "CANVASS_CHECKPOINT";

export type CanvassCheckpoint = {
  status: "running" | "paused";
  city: string;
  /** Next Maps query index in this city (0 = plumbers). */
  queryIndex: number;
  citiesDone: string[];
  jobId: string | null;
};

export function parseCheckpoint(raw: string): CanvassCheckpoint | null {
  try {
    const json = JSON.parse(raw) as Partial<CanvassCheckpoint>;
    if (json.status !== "running" && json.status !== "paused") return null;
    const city = String(json.city || "").trim();
    if (!city) return null;
    const queryIndex = Number(json.queryIndex);
    return {
      status: json.status,
      city,
      queryIndex: Number.isFinite(queryIndex) && queryIndex > 0 ? Math.floor(queryIndex) : 0,
      citiesDone: Array.isArray(json.citiesDone) ? json.citiesDone.map(String).filter(Boolean) : [],
      jobId: json.jobId ? String(json.jobId) : null,
    };
  } catch {
    return null;
  }
}

export async function loadCheckpoint(): Promise<CanvassCheckpoint | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    if (!row?.value.trim()) return null;
    return parseCheckpoint(row.value);
  } catch {
    return null;
  }
}

export async function saveCheckpoint(checkpoint: CanvassCheckpoint): Promise<void> {
  const value = JSON.stringify(checkpoint);
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
}

export async function clearCheckpoint(): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: KEY } });
}
