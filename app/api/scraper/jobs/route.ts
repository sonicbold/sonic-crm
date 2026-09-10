import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const [jobs, totalJobs, totalScraped] = await Promise.all([
      prisma.searchJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.searchJob.count(),
      prisma.lead.count({ where: { source: "ai_scraper" } }),
    ]);

    return NextResponse.json({
      jobs,
      totalJobs,
      totalScraped,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to list jobs" }, { status: 500 });
  }
}
