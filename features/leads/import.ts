export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { LeadImportError, runLeadImport } from "@/features/leads/import-run";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await runLeadImport(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LeadImportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
