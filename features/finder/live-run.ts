import { logger } from "@/shared/log";
import { runAutonomousFinder, saveFinderLeadsToCrm } from "@/features/finder/scraper-run";
import { leadCap, shouldContinueAfterBatch } from "@/features/finder/canvass";
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from "@/features/finder/checkpoint";
import type { SavedCrmLead, SaveStats } from "@/features/finder/scraper-run";
import type { PipelineEvent } from "@/features/finder/types";

export type SavedEvent = {
  type: "saved";
  provider: string;
  stats: SaveStats;
  leads: SavedCrmLead[];
  csvFilename: string;
  warnings: string[];
};

export type LiveEvent = PipelineEvent | SavedEvent;

type Listener = () => void;

type LiveRun = {
  running: boolean;
  runId: string;
  events: LiveEvent[];
  listeners: Set<Listener>;
  abort: AbortController;
};

type LiveBox = { current: LiveRun | null };

const box: LiveBox = ((globalThis as typeof globalThis & { __sonicFinderLive?: LiveBox }).__sonicFinderLive ??= {
  current: null,
});

export function resetLiveRunForTests() {
  box.current?.abort.abort();
  box.current = null;
}

export function liveSnapshot(): { running: boolean; runId: string | null; events: LiveEvent[] } {
  const run = box.current;
  return { running: Boolean(run?.running), runId: run?.runId ?? null, events: run?.events ?? [] };
}

/** Start work that keeps running after the browser leaves this page. */
export function beginLiveRun(
  work: (ctx: { signal: AbortSignal; emit: (event: LiveEvent) => void }) => Promise<void>,
): { ok: true } | { ok: false; error: string } {
  if (box.current?.running) return { ok: false, error: "The finder is already on." };
  const abort = new AbortController();
  const runId = crypto.randomUUID();
  const log = logger("finder.live").child({ runId });
  const run: LiveRun = { running: true, runId, events: [], listeners: new Set(), abort };
  box.current = run;
  const emit = (event: LiveEvent) => {
    run.events.push(event);
    for (const listener of run.listeners) listener();
  };
  log.info("Canvass started");
  const task = work({ signal: abort.signal, emit })
    .catch((err: unknown) => {
      log.error("run failed", { err });
      emit({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      run.running = false;
      log.info("Canvass stopped", { aborted: abort.signal.aborted, events: run.events.length });
      for (const listener of run.listeners) listener();
    });
  // Root the promise on the run so it stays alive after the HTTP request ends.
  Object.assign(run, { task });
  return { ok: true };
}

export function startFinderRun(): { ok: true } | { ok: false; error: string } {
  hookFinderSignals();
  return beginLiveRun(async ({ signal, emit }) => {
    while (!signal.aborted) {
      const result = await runAutonomousFinder(emit, signal);
      if (result.error) return;
      const checkpoint = await loadCheckpoint();
      if (result.paused) {
        emit({
          type: "log",
          message: "Finder is paused. Start the PC again and Canvass continues this city.",
        });
        return;
      }
      const saved = await saveFinderLeadsToCrm({
        prompt: `Canvass ${result.parsed?.city || "plumber markets"}`,
        parsed: result.parsed,
        leads: [],
        jobId: checkpoint?.jobId,
        finish: true,
      });
      emit({
        type: "saved",
        provider: "finder",
        stats: {
          requested: result.leads.length,
          found: result.leads.length,
          duplicates: 0,
          newLeads: result.leads.length,
          skippedNoPhone: 0,
        },
        leads: saved.leads,
        csvFilename: result.csvFilename,
        warnings: result.warnings,
      });
      const keepGoing = shouldContinueAfterBatch({
        leadCap: leadCap(),
        hitLeadCap: result.hitLeadCap,
        paused: result.paused,
        error: result.error,
        leadCount: result.leads.length,
      });
      if (!keepGoing || signal.aborted) {
        await clearCheckpoint();
        return;
      }
      if (checkpoint) {
        await saveCheckpoint({
          ...checkpoint,
          status: "running",
          jobId: null,
        });
      }
      emit({
        type: "log",
        message: `Starting the next ${leadCap()}-lead batch. Turn off is the only stop.`,
      });
    }
  });
}

let signalsHooked = false;
function hookFinderSignals() {
  if (signalsHooked) return;
  signalsHooked = true;
  const pause = () => {
    stopFinderRun();
  };
  process.on("SIGTERM", pause);
  process.on("SIGINT", pause);
}

/** After Docker or the PC starts, continue a paused Canvass instead of walking from the first city. */
export function resumeCanvassOnBoot() {
  hookFinderSignals();
  setTimeout(() => {
    void loadCheckpoint().then((checkpoint) => {
      if (!checkpoint) return;
      logger("finder.live").info("Resuming Canvass from checkpoint", {
        city: checkpoint.city,
        queryIndex: checkpoint.queryIndex,
        jobId: checkpoint.jobId,
      });
      startFinderRun();
    });
  }, 1500);
}

export function stopFinderRun(): boolean {
  const run = box.current;
  if (!run?.running) return false;
  run.abort.abort();
  return true;
}

export function liveEventStream(from = 0): Response {
  const encoder = new TextEncoder();
  let cursor = Number.isFinite(from) && from > 0 ? Math.floor(from) : 0;
  let unsubscribe = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const run = box.current;
      if (!run) {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        return;
      }
      let pumping = false;
      const pump = () => {
        if (pumping) return;
        pumping = true;
        try {
          const current = box.current;
          if (!current || current !== run) {
            unsubscribe();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
            return;
          }
          while (cursor < current.events.length) {
            const event = current.events[cursor++];
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
          if (!current.running) {
            unsubscribe();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        } catch {
          unsubscribe();
        } finally {
          pumping = false;
        }
      };
      const listener = () => pump();
      run.listeners.add(listener);
      unsubscribe = () => run.listeners.delete(listener);
      pump();
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
