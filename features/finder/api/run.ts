export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { liveEventStream, liveSnapshot } from "@/features/finder/live-run";

export async function GET(req: NextRequest) {
  const from = Number(req.nextUrl.searchParams.get("from"));
  if (req.nextUrl.searchParams.has("stream")) {
    return liveEventStream(Number.isFinite(from) ? from : 0);
  }
  return Response.json(liveSnapshot());
}
