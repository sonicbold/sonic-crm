export const dynamic = "force-dynamic";
export const maxDuration = 800;
export const runtime = "nodejs";

import { liveEventStream, startFinderRun } from "@/features/finder/live-run";
import { jsonError } from "@/shared/route";

export async function POST() {
  const started = startFinderRun();
  if (!started.ok) {
    return jsonError("finder.execute", started.error, 409);
  }

  return liveEventStream(0);
}
