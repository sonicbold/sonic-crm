import { PrismaClient } from "@prisma/client";
import { splitLocation } from "../features/finder/scraper-run";

const prisma = new PrismaClient();

async function main() {
  const leads = await prisma.lead.findMany({
    select: { id: true, address: true, city: true, state: true, businessName: true },
  });
  let updated = 0;
  for (const lead of leads) {
    const source = lead.address || [lead.city, lead.state].filter(Boolean).join(", ");
    const loc = splitLocation(source);
    if (!loc.city) continue;
    const same = loc.city === lead.city && loc.state === (lead.state || "");
    if (same) continue;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { city: loc.city, state: loc.state || null, address: loc.address || lead.address },
    });
    updated += 1;
  }
  console.log(JSON.stringify({ total: leads.length, updated }));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
