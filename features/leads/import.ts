/** CSV/JSON lead import. Duplicate phones are skipped, not overwritten. */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { ensureE164 } from "@/shared/utils";
import { websiteFields } from "@/shared/website-status";
import { jsonError } from "@/shared/route";

export async function POST(req: NextRequest) {
  const { leads } = await req.json();
  if (!leads || !Array.isArray(leads)) return jsonError("leads.import", "Invalid payload", 400);

  let imported = 0;
  for (const row of leads) {
    if (!row.phone) continue;
    const normalizedPhone = ensureE164(row.phone);
    try {
      await prisma.lead.upsert({
        where: { phone: normalizedPhone },
        create: {
          phone: normalizedPhone,
          businessName: row.businessName || row.company || null,
          name: row.name || null,
          city: row.city || null,
          ...websiteFields(row.website || row.url || row.site),
          source: "import"
        },
        update: {}
      });
      imported++;
    } catch { /* ignore duplicates */ }
  }
  return NextResponse.json({ imported, success: true });
}
