const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const NONE = /^(no link|no website|no site|none|n\/a|na|null|undefined|-|not listed|not found)$/i;
const NON_SITE = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "yelp.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "bbb.org",
  "thumbtack.com",
];

function websiteFields(raw) {
  const value = (raw || "").trim();
  if (!value || NONE.test(value)) return { websiteStatus: "no_website", website: null };
  let next = value;
  if (!/^https?:\/\//i.test(next)) next = `https://${next}`;
  try {
    const url = new URL(next);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (NON_SITE.some((d) => host === d || host.endsWith(`.${d}`))) {
      return { websiteStatus: "no_website", website: null };
    }
    if (host.includes("google.com") && host !== "sites.google.com") {
      return { websiteStatus: "no_website", website: null };
    }
    url.protocol = "https:";
    url.hash = "";
    return { websiteStatus: "has_website", website: url.toString().replace(/\/$/, "") };
  } catch {
    return { websiteStatus: "uncertain", website: null };
  }
}

async function main() {
  const rows = JSON.parse(fs.readFileSync("/tmp/xlsx-leads.json", "utf8"));
  const existing = await prisma.lead.findMany({ select: { phone: true } });
  const have = new Set(existing.map((row) => row.phone.replace(/\D/g, "").slice(-10)));
  let created = 0;
  let skippedDup = 0;
  for (const row of rows) {
    const last10 = String(row.phone || "").replace(/\D/g, "").slice(-10);
    if (!last10 || have.has(last10)) {
      skippedDup += 1;
      continue;
    }
    have.add(last10);
    const site = websiteFields(row.website);
    await prisma.lead.create({
      data: {
        phone: row.phone,
        businessName: row.businessName,
        name: null,
        city: row.city,
        state: row.state,
        address: row.address,
        website: site.website,
        websiteStatus: site.websiteStatus,
        rating: row.rating,
        reviewCount: row.reviewCount,
        googleMapsUrl: row.googleMapsUrl,
        notes: row.notes,
        category: row.category,
        source: "import",
        status: "new",
      },
    });
    created += 1;
  }
  console.log(JSON.stringify({ input: rows.length, created, skippedDup, totalAfter: have.size }));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
