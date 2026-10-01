export const WEBSITE_STATUSES = ["has_website", "no_website", "uncertain"] as const;

export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export type WebsiteClassification = {
  websiteStatus: WebsiteStatus;
  /** Verified business URL. Null unless the lead has a website. Uncertain leads keep the candidate here so it can be reviewed. */
  website: string | null;
};

const NONE = /^(no link|no website|no site|none|n\/a|na|null|undefined|-|not listed|not found|without website|no url)$/i;

/** Profiles and directories are not the business's own site. */
const NON_SITE_HOSTS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
  "yelp.com",
  "yellowpages.com",
  "yp.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "bbb.org",
  "nextdoor.com",
  "mapquest.com",
  "foursquare.com",
  "tripadvisor.com",
  "thumbtack.com",
  "houzz.com",
  "porch.com",
  "bark.com",
  "apple.com",
  "bing.com",
  "g.page",
  "business.google.com",
];

/** Short links hide the destination, so the site cannot be verified. */
const SHORTENER_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "ow.ly",
  "buff.ly",
  "rb.gy",
  "shorturl.at",
  "cutt.ly",
  "is.gd",
  "tiny.cc",
];

const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];

export function websiteStatusLabel(status: string | null | undefined): string {
  if (status === "has_website") return "Has Website";
  if (status === "no_website") return "No Website";
  return "Uncertain";
}

export function classifyWebsite(raw: string | null | undefined): WebsiteClassification {
  const value = (raw || "").trim();
  if (!value || NONE.test(value)) return { websiteStatus: "no_website", website: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { websiteStatus: "uncertain", website: null };

  const url = parseUrl(value);
  if (!url) return { websiteStatus: "uncertain", website: null };

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!host || host === "localhost" || isIp(host)) return { websiteStatus: "uncertain", website: null };
  if (isGoogleNonSite(host) || hostMatches(host, NON_SITE_HOSTS)) {
    return { websiteStatus: "no_website", website: null };
  }
  if (hostMatches(host, SHORTENER_HOSTS)) {
    return { websiteStatus: "uncertain", website: canonicalUrl(url) };
  }
  return { websiteStatus: "has_website", website: canonicalUrl(url) };
}

export function websiteFields(raw: string | null | undefined): WebsiteClassification {
  return classifyWebsite(raw);
}

/** Host of a real shop site. Null if there is no site to match on. */
export function websiteDedupKey(raw: string | null | undefined): string | null {
  const classified = classifyWebsite(raw);
  if (classified.websiteStatus !== "has_website" || !classified.website) return null;
  try {
    return new URL(classified.website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function parseUrl(value: string): URL | null {
  let next = value;
  if (!/^https?:\/\//i.test(next)) {
    next = next.startsWith("//") ? `https:${next}` : `https://${next}`;
  }
  try {
    const url = new URL(next);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

function canonicalUrl(url: URL): string {
  url.protocol = "https:";
  url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  url.hash = "";
  for (const key of TRACKING_PARAMS) url.searchParams.delete(key);
  const href = url.toString();
  return url.pathname === "/" && href.endsWith("/") ? href.slice(0, -1) : href;
}

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isGoogleNonSite(host: string): boolean {
  if (host === "sites.google.com" || host.endsWith(".sites.google.com")) return false;
  return host === "google.com" || host.endsWith(".google.com") || host === "goo.gl" || host.endsWith(".goo.gl") || host === "maps.app.goo.gl";
}

function isIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}
