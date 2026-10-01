import { prisma } from "@/shared/db";
import { classifyWebsite } from "@/shared/website-status";

let backfilled = false;

/** Classify leads saved before website status existed. */
export async function backfillWebsiteStatuses() {
  if (backfilled) return;
  for (let pass = 0; pass < 50; pass += 1) {
    const rows = await prisma.lead.findMany({
      where: { websiteStatus: null },
      select: { id: true, website: true },
      take: 200,
    });
    if (!rows.length) {
      backfilled = true;
      return;
    }
    await prisma.$transaction(
      rows.map((row) => {
        const classified = classifyWebsite(row.website);
        return prisma.lead.update({
          where: { id: row.id },
          data: { websiteStatus: classified.websiteStatus, website: classified.website },
        });
      }),
    );
  }
}
