/** Shared types for the lead-finding pipeline. */

export type WebsitePreference = "with" | "without" | "any";

/** Structured Finder search for one city. */
export type ParsedRequest = {
  businessType: string;
  city: string;
  /** Keep listings with at least this many reviews. Null means no floor. */
  minReviews: number | null;
  /** Drop listings with this many reviews or more. Null means no cap. */
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
  /** Google star rating, when the Maps result includes one. */
  rating: number | null;
  url: string;
  placeId: string;
  category?: string;
  listedOwnerName?: string;
  /** Reviews were read and no personal name was written. Do not buy them again. */
  ownerChecked?: boolean;
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
  rating: number | null;
  note?: string;
};

/** Live scrape/enrich status shown in the Finder UI. */
export type FinderStatus = {
  target: number;
  validLeads: number;
  remaining: number;
  aiProvider: string;
  nextRequestInMs: number;
  mapsPaidCalls?: number;
  mapsCacheHits?: number;
  crmDuplicates?: number;
  newLeads?: number;
  leadCap?: number | null;
  nameRatePct?: number;
  nameDetectNamed?: number;
  nameDetectWithReviews?: number;
  websitePct?: number;
  noWebsitePct?: number;
  withWebsite?: number;
  noWebsite?: number;
};

export type PipelineEvent =
  | { type: "step"; step: number; label: string }
  | { type: "log"; message: string }
  | { type: "progress"; current: number; total: number; message: string }
  | {
      type: "status";
      target?: number;
      validLeads?: number;
      remaining?: number;
      aiProvider?: string;
      nextRequestInMs?: number;
      mapsPaidCalls?: number;
      mapsCacheHits?: number;
      crmDuplicates?: number;
      newLeads?: number;
      leadCap?: number | null;
      nameRatePct?: number;
      nameDetectNamed?: number;
      nameDetectWithReviews?: number;
      websitePct?: number;
      noWebsitePct?: number;
      withWebsite?: number;
      noWebsite?: number;
    }
  | { type: "parsed"; parsed: ParsedRequest }
  | {
      type: "done";
      leads: Lead[];
      warnings: string[];
      csvFilename: string;
      spendLog?: string;
      paused?: boolean;
      hitLeadCap?: boolean;
    }
  | { type: "error"; message: string };

export type AppSettings = {
  GEMINI_API_KEY: string;
  GEMINI_API_KEY_2: string;
  GEMINI_API_KEY_3: string;
  APIFY_API_TOKEN: string;
  GROQ_API_KEY_1: string;
  GROQ_API_KEY_2: string;
  GROQ_API_KEY_3: string;
  APIFY_MAPS_ACTOR: string;
  APIFY_REVIEWS_ACTOR: string;
  GEMINI_MODEL: string;
  GROQ_MODEL: string;
};

export type SettingsStatus = {
  gemini: boolean;
  gemini2: boolean;
  gemini3: boolean;
  apify: boolean;
  groq1: boolean;
  groq2: boolean;
  groq3: boolean;
  mapsActor: string;
  reviewsActor: string;
  geminiModel: string;
  groqModel: string;
};
