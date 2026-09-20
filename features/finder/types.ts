/** Shared types for the lead-finding pipeline. */

export type WebsitePreference = "with" | "without" | "any";

/** What Gemini extracted from the user's natural-language request. */
export type ParsedRequest = {
  businessType: string;
  city: string;
  maxReviews: number | null;
  websitePreference: WebsitePreference;
  targetCount: number;
};

/** One Google Maps listing after Apify search. */
export type MapPlace = {
  title: string;
  phone: string;
  address: string;
  website: string | null;
  reviewsCount: number;
  url: string;
  placeId: string;
  listedOwnerName?: string;
};

export type Review = {
  text: string;
  author: string;
  stars: number | null;
  ownerReply?: string;
};

/** One row in the final outreach table. */
export type Lead = {
  index: number;
  ownerName: string;
  businessName: string;
  phone: string;
  location: string;
  website: string;
  profileUrl: string;
  summary: string;
  reviewsCount: number;
  note?: string;
};

export type PipelineEvent =
  | { type: "step"; step: number; label: string }
  | { type: "log"; message: string }
  | { type: "progress"; current: number; total: number; message: string }
  | { type: "parsed"; parsed: ParsedRequest }
  | { type: "done"; leads: Lead[]; warnings: string[]; csvFilename: string }
  | { type: "error"; message: string };

export type AppSettings = {
  GEMINI_API_KEY: string;
  APIFY_API_TOKEN: string;
  GROQ_API_KEY_1: string;
  GROQ_API_KEY_2: string;
  OPENROUTER_API_KEY: string;
  APIFY_MAPS_ACTOR: string;
  APIFY_REVIEWS_ACTOR: string;
  GEMINI_MODEL: string;
  GROQ_MODEL: string;
  OPENROUTER_MODEL: string;
};

export type SettingsStatus = {
  gemini: boolean;
  apify: boolean;
  groq1: boolean;
  groq2: boolean;
  openrouter: boolean;
  mapsActor: string;
  reviewsActor: string;
  geminiModel: string;
  groqModel: string;
  openrouterModel: string;
};
