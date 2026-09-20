import { getConfig, saveSettings as saveCrmSettings } from "@/shared/settings";
import type { AppSettings, SettingsStatus } from "./types";

const DEFAULTS: AppSettings = {
  GEMINI_API_KEY: "",
  APIFY_API_TOKEN: "",
  GROQ_API_KEY_1: "",
  GROQ_API_KEY_2: "",
  OPENROUTER_API_KEY: "",
  APIFY_MAPS_ACTOR: "kaix/google-maps-places-scraper",
  APIFY_REVIEWS_ACTOR: "kaix/google-maps-reviews-scraper",
  GEMINI_MODEL: "gemini-3.6-flash",
  GROQ_MODEL: "openai/gpt-oss-20b",
  OPENROUTER_MODEL: "openrouter/free",
};

const RETIRED_GEMINI_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
]);

const RETIRED_GROQ_MODELS = new Set([
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "llama3-8b-8192",
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
]);

function currentGeminiModel(value: string): string {
  if (!value || RETIRED_GEMINI_MODELS.has(value)) return DEFAULTS.GEMINI_MODEL;
  return value;
}

function currentGroqModel(value: string): string {
  if (!value || RETIRED_GROQ_MODELS.has(value)) return DEFAULTS.GROQ_MODEL;
  return value;
}

function currentMapsActor(value: string): string {
  if (!value || value.startsWith("compass/")) return DEFAULTS.APIFY_MAPS_ACTOR;
  return value;
}

function currentReviewsActor(value: string): string {
  if (!value || value.startsWith("compass/")) return DEFAULTS.APIFY_REVIEWS_ACTOR;
  return value;
}

export async function loadSettings(): Promise<AppSettings> {
  const cfg = await getConfig();
  return {
    GEMINI_API_KEY: cfg.GEMINI_API_KEY,
    APIFY_API_TOKEN: cfg.APIFY_API_TOKEN,
    GROQ_API_KEY_1: cfg.GROQ_API_KEY_1,
    GROQ_API_KEY_2: cfg.GROQ_API_KEY_2,
    OPENROUTER_API_KEY: cfg.OPENROUTER_API_KEY,
    APIFY_MAPS_ACTOR: currentMapsActor(cfg.APIFY_MAPS_ACTOR),
    APIFY_REVIEWS_ACTOR: currentReviewsActor(cfg.APIFY_REVIEWS_ACTOR),
    GEMINI_MODEL: currentGeminiModel(cfg.GEMINI_MODEL || DEFAULTS.GEMINI_MODEL),
    GROQ_MODEL: currentGroqModel(cfg.GROQ_MODEL || DEFAULTS.GROQ_MODEL),
    OPENROUTER_MODEL: cfg.OPENROUTER_MODEL || DEFAULTS.OPENROUTER_MODEL,
  };
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  await saveCrmSettings(partial);
  return loadSettings();
}

export function settingsStatus(settings: AppSettings): SettingsStatus {
  return {
    gemini: Boolean(settings.GEMINI_API_KEY),
    apify: Boolean(settings.APIFY_API_TOKEN),
    groq1: Boolean(settings.GROQ_API_KEY_1),
    groq2: Boolean(settings.GROQ_API_KEY_2),
    openrouter: Boolean(settings.OPENROUTER_API_KEY),
    mapsActor: settings.APIFY_MAPS_ACTOR,
    reviewsActor: settings.APIFY_REVIEWS_ACTOR,
    geminiModel: settings.GEMINI_MODEL,
    groqModel: settings.GROQ_MODEL,
    openrouterModel: settings.OPENROUTER_MODEL,
  };
}

export function assertReady(settings: AppSettings) {
  const missing: string[] = [];
  if (!settings.GEMINI_API_KEY) missing.push("Gemini API key");
  if (!settings.APIFY_API_TOKEN) missing.push("Apify API token");
  if (!settings.GROQ_API_KEY_1 && !settings.GROQ_API_KEY_2 && !settings.OPENROUTER_API_KEY) {
    missing.push("at least one Groq or OpenRouter API key");
  }
  if (missing.length) {
    throw new Error(`Add these in Settings before running: ${missing.join(", ")}.`);
  }
}
