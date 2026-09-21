import { NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { crmLeadsToCsv } from "@/features/finder/csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
    });
    const csv = crmLeadsToCsv(leads);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="all-leads-${stamp}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export leads" },
      { status: 500 },
    );
  }
}
