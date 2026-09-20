export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { ensureE164 } from "@/shared/utils";

export async function POST(req: NextRequest) {
  try {
    const { leads } = await req.json();
    if (!leads || !Array.isArray(leads)) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

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
            source: "import"
          },
          update: {}
        });
        imported++;
      } catch (e) { /* ignore duplicates */ }
    }
    return NextResponse.json({ imported, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
