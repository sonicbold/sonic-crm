export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { stopFinderRun } from "@/features/finder/live-run";

export async function POST() {
  stopFinderRun();
  return Response.json({ ok: true });
}
