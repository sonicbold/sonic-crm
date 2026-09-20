export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { campaignTimezone, describePlan, planSendTimes } from "@/features/campaigns/drip-schedule";

export async function GET(req: NextRequest) {
  const count = Math.min(500, Math.max(0, parseInt(new URL(req.url).searchParams.get("count") || "0")));
  const tz = campaignTimezone();
  const times = planSendTimes(count, new Date(), tz);
  return NextResponse.json({
    ...describePlan(times, tz),
    sample: times.slice(0, 6).map((d) => new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(d)),
  });
}
