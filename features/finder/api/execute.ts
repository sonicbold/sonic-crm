export const dynamic = "force-dynamic";
export const maxDuration = 800;
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { runFinderPipeline, saveFinderLeadsToCrm } from "@/features/finder/scraper-run";
import type { PipelineEvent } from "@/features/finder/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Type a search request first." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent | Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const result = await runFinderPipeline(prompt, (event) => send(event));
        if (result.error) return;
        const saved = await saveFinderLeadsToCrm({
          prompt,
          parsed: result.parsed,
          leads: result.leads,
        });
        send({
          type: "saved",
          provider: "finder",
          stats: saved.stats,
          leads: saved.leads,
          csvFilename: result.csvFilename,
          warnings: result.warnings,
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
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
