import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyImportRules,
  blankMappedColumns,
  explicitNoWebsiteMarker,
  isTollFreePhone,
  parseCsv,
  recheckPreparedLead,
  sanitizeMapping,
  toImportPhone,
} from "../features/leads/import-rules";

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

check("toll-free prefixes are skipped and local numbers stay", () => {
  for (const prefix of ["800", "833", "844", "855", "866", "877", "888"]) {
    assert.equal(isTollFreePhone(`(${prefix}) 555-0100`), true);
    assert.equal(toImportPhone(`+1${prefix}5550100`).ok, false);
  }
  const kept = toImportPhone("(720) 970-1941");
  assert.equal(kept.ok && kept.e164, "+17209701941");
  assert.equal(isTollFreePhone("(720) 970-1941"), false);
});

check("quoted CSV keeps commas inside the business name", () => {
  const rows = parseCsv('Name,City,Notes\n"Acme, LLC","Denver, CO","no_website"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Name, "Acme, LLC");
  assert.equal(rows[0].City, "Denver, CO");
});

check("explicit no-website markers", () => {
  assert.equal(explicitNoWebsiteMarker("not_found (tried 3)"), true);
  assert.equal(explicitNoWebsiteMarker("no_website:+25; reviews=0"), true);
  assert.equal(explicitNoWebsiteMarker("domain_guess:phone_match"), false);
  assert.equal(explicitNoWebsiteMarker(""), false);
});

check("does not invent a contact or use the search metro as the city", () => {
  const rows = [
    {
      name: "Fixed Right Plumbing",
      owner_name: "",
      phone: "(702) 283-5261",
      street: "11 E PACIFIC AVE",
      city: "Henderson",
      state: "NV",
      website: "",
      website_found_via: "not_found (tried 2)",
      search_city: "Las Vegas, NV",
      source_urls: "https://www.angi.com/companylist/example",
      sources: "angi",
    },
    {
      name: "Has Site Plumbing",
      owner_name: "Ada Owner",
      phone: "(305) 433-2800",
      street: "",
      city: "Miami",
      state: "FL",
      website: "https://example-plumbing.com/",
      website_found_via: "domain_guess:phone_match",
      search_city: "Miami, FL",
      source_urls: "https://www.angi.com/companylist/example-2",
      sources: "angi",
    },
    {
      name: "No Location Co",
      owner_name: "",
      phone: "(206) 696-3371",
      street: "",
      city: "",
      state: "WA",
      website: "",
      website_found_via: "not_found (tried 2)",
      search_city: "Seattle, WA",
      source_urls: "",
      sources: "angi",
    },
    {
      name: "Toll Free Shop",
      owner_name: "Pat",
      phone: "(800) 555-0199",
      street: "1 Main",
      city: "Denver",
      state: "CO",
      website: "",
      website_found_via: "not_found (tried 2)",
      search_city: "Denver, CO",
      source_urls: "",
      sources: "angi",
    },
    {
      name: "Same Phone Duplicate",
      owner_name: "",
      phone: "(702) 283-5261",
      street: "11 E PACIFIC AVE",
      city: "Henderson",
      state: "NV",
      website: "",
      website_found_via: "not_found (tried 2)",
      search_city: "Las Vegas, NV",
      source_urls: "",
      sources: "angi",
    },
  ];
  const headers = Object.keys(rows[0]);
  const sanitized = sanitizeMapping({
    company: "name",
    website: "source_urls",
    websiteStatus: "website_found_via",
    gbp: "source_urls",
    contact: "name",
    phone: "phone",
    city: "search_city",
    address: "street",
    state: "state",
    sourceColumn: "sources",
  }, headers, rows);

  assert.equal(sanitized.columns.city, "city");
  assert.equal(sanitized.columns.contact, "owner_name");
  assert.equal(sanitized.columns.gbp, null);
  assert.equal(sanitized.columns.website, "website");

  const result = applyImportRules(rows, sanitized.columns, "angi");
  assert.equal(result.leads.length, 2);
  assert.equal(result.skipReasons.missing_location, 1);
  assert.equal(result.skipReasons.toll_free, 1);
  assert.equal(result.skipReasons.duplicate_phone, 1);
  assert.equal(result.leads[0].name, null);
  assert.equal(result.leads[0].website, "No link");
  assert.equal(result.leads[0].websiteStatus, "none");
  assert.equal(result.leads[0].city, "Henderson");
  assert.equal(result.leads[0].source, "angi");
  assert.equal(result.leads[0].status, "new");
  assert.equal(result.leads[0].phone, "+17022835261");
  assert.equal(result.leads[1].name, "Ada Owner");
  assert.equal(result.leads[1].website, "https://example-plumbing.com/");
  assert.equal(result.leads[1].googleMapsUrl, null);
});

check("CRM-shaped rows use notes as explicit no-website and keep Maps URLs", () => {
  const maps = "https://www.google.com/maps/search/?api=1&query=Shop";
  const rows = [
    {
      "Owner Name": "",
      "Business Name": "All Day Plumbing LLC",
      Phone: "+19549952209",
      Email: "",
      City: "Miami",
      State: "FL",
      Address: "12529 SW 211 TER, Miami, FL 33175",
      Website: "",
      "Google Maps": maps,
      Notes: "weakness_score=85; no_website:+25",
      Source: "angi",
    },
  ];
  const sanitized = sanitizeMapping({
    company: "Business Name",
    website: "Website",
    websiteStatus: null,
    gbp: "Google Maps",
    contact: "Owner Name",
    phone: "Phone",
    email: "Email",
    city: "City",
    address: "Address",
    state: "State",
    sourceColumn: "Source",
  }, Object.keys(rows[0]), rows);
  assert.equal(sanitized.columns.websiteStatus, "Notes");
  const result = applyImportRules(rows, sanitized.columns, "angi");
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].website, "No link");
  assert.equal(result.leads[0].googleMapsUrl, maps);
  assert.equal(result.leads[0].name, null);
  assert.equal(result.leads[0].phone, "+19549952209");
});

check("unknown website status is skipped", () => {
  const columns = blankMappedColumns();
  columns.company = "company";
  columns.phone = "phone";
  columns.city = "city";
  columns.website = "website";
  const result = applyImportRules([
    { company: "Mystery LLC", phone: "7025550101", city: "Las Vegas", website: "" },
  ], columns, "import");
  assert.equal(result.leads.length, 0);
  assert.equal(result.skipReasons.website_status_unknown, 1);
});

check("prepared rows are rechecked and cannot smuggle a toll-free phone", () => {
  const bad = recheckPreparedLead({
    businessName: "Toll Free Shop",
    phone: "+18005550199",
    city: "Denver",
    website: "No link",
    websiteStatus: "none",
    source: "angi",
  });
  assert.equal(bad.ok, false);
  const good = recheckPreparedLead({
    businessName: "Shop",
    name: "",
    phone: "+17022835261",
    city: "Henderson",
    website: "No link",
    source: "angi",
    googleMapsUrl: "https://facebook.com/not-maps",
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.lead.name, null);
    assert.equal(good.lead.googleMapsUrl, null);
    assert.equal(good.lead.status, "new");
  }
});

const rawPath = process.env.ANGI_CSV;
if (rawPath) {
  check(`attached csv ${rawPath}`, () => {
    const rows = parseCsv(readFileSync(rawPath, "utf8"));
    const headers = Object.keys(rows[0] || {});
    const sanitized = sanitizeMapping({
      company: headers.includes("name") ? "name" : "Business Name",
      website: headers.includes("website") ? "website" : "Website",
      websiteStatus: headers.includes("website_found_via") ? "website_found_via" : null,
      gbp: headers.includes("Google Maps") ? "Google Maps" : "source_urls",
      contact: headers.includes("name") ? "name" : "Owner Name",
      phone: headers.includes("phone") ? "phone" : "Phone",
      city: headers.includes("search_city") ? "search_city" : "City",
      address: headers.includes("street") ? "street" : "Address",
      state: headers.includes("state") ? "state" : "State",
      sourceColumn: headers.includes("sources") ? "sources" : "Source",
    }, headers, rows);
    const result = applyImportRules(rows, sanitized.columns, "angi");
    console.log(JSON.stringify({
      rows: rows.length,
      wouldImport: result.leads.length,
      skipReasons: result.skipReasons,
      withOwner: result.leads.filter((lead) => lead.name).length,
      withSite: result.leads.filter((lead) => lead.websiteStatus === "url").length,
      noSite: result.leads.filter((lead) => lead.websiteStatus === "none").length,
      withMaps: result.leads.filter((lead) => lead.googleMapsUrl).length,
      mapping: sanitized.columns,
    }));
  });
}

console.log("import rules ok");
