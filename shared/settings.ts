import { prisma } from "@/shared/db";

export const SETTING_KEYS = [
  "GEMINI_API_KEY",
  "TELNYX_API_KEY",
  "TELNYX_PHONE_NUMBER",
  "TELNYX_PUBLIC_KEY",
  "TELNYX_MESSAGING_PROFILE_ID",
  "APIFY_API_TOKEN",
  "GROQ_API_KEY_1",
  "GROQ_API_KEY_2",
  "OPENROUTER_API_KEY",
  "APIFY_MAPS_ACTOR",
  "APIFY_REVIEWS_ACTOR",
  "GEMINI_MODEL",
  "GROQ_MODEL",
  "OPENROUTER_MODEL",
  "NOTIFY_PHONE",
  "CRM_TIMEZONE",
  "CRM_API_KEY",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export type AppConfig = Record<SettingKey, string>;

function fromEnv(): AppConfig {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
    TELNYX_API_KEY: process.env.TELNYX_API_KEY || "",
    TELNYX_PHONE_NUMBER: process.env.TELNYX_PHONE_NUMBER || "",
    TELNYX_PUBLIC_KEY: process.env.TELNYX_PUBLIC_KEY || "",
    TELNYX_MESSAGING_PROFILE_ID: process.env.TELNYX_MESSAGING_PROFILE_ID || "",
    APIFY_API_TOKEN: process.env.APIFY_API_TOKEN || "",
    GROQ_API_KEY_1: process.env.GROQ_API_KEY_1 || "",
    GROQ_API_KEY_2: process.env.GROQ_API_KEY_2 || "",
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
    APIFY_MAPS_ACTOR: process.env.APIFY_MAPS_ACTOR || "kaix/google-maps-places-scraper",
    APIFY_REVIEWS_ACTOR: process.env.APIFY_REVIEWS_ACTOR || "kaix/google-maps-reviews-scraper",
    GEMINI_MODEL: process.env.GEMINI_MODEL || "",
    GROQ_MODEL: process.env.GROQ_MODEL || "",
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "",
    NOTIFY_PHONE: process.env.NOTIFY_PHONE || "",
    CRM_TIMEZONE: process.env.CRM_TIMEZONE || "America/New_York",
    CRM_API_KEY: process.env.CRM_API_KEY || "",
  };
}

export async function getConfig(): Promise<AppConfig> {
  const env = fromEnv();
  try {
    const rows = await prisma.appSetting.findMany();
    for (const row of rows) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key) && row.value.trim()) {
        env[row.key as SettingKey] = row.value.trim();
      }
    }
  } catch {
    // DB not migrated yet — fall back to env
  }
  return env;
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function saveSettings(input: Partial<Record<SettingKey, string>>) {
  for (const key of SETTING_KEYS) {
    if (input[key] === undefined) continue;
    const value = (input[key] || "").trim();
    if (!value || value.includes("••••")) continue;
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  return getConfig();
}

export function configStatus(cfg: AppConfig) {
  const groqOrOpenrouter = !!cfg.GROQ_API_KEY_1 || !!cfg.GROQ_API_KEY_2 || !!cfg.OPENROUTER_API_KEY;
  return {
    gemini: !!cfg.GEMINI_API_KEY,
    telnyx: !!cfg.TELNYX_API_KEY && !!cfg.TELNYX_PHONE_NUMBER,
    apify: !!cfg.APIFY_API_TOKEN,
    groq: !!cfg.GROQ_API_KEY_1 || !!cfg.GROQ_API_KEY_2,
    openrouter: !!cfg.OPENROUTER_API_KEY,
    finder: !!cfg.GEMINI_API_KEY && !!cfg.APIFY_API_TOKEN && groqOrOpenrouter,
    notify: !!cfg.NOTIFY_PHONE,
    agentApi: !!cfg.CRM_API_KEY,
    ready: !!(cfg.GEMINI_API_KEY && cfg.TELNYX_API_KEY && cfg.TELNYX_PHONE_NUMBER),
  };
}
