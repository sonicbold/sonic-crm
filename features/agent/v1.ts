export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAgentKey } from "@/shared/api-auth";
import { handleAgentRequest } from "@/features/agent/agent-api";

async function run(req: NextRequest, method: string) {
  const denied = await requireAgentKey(req);
  if (denied) return denied;
  try {
    return await handleAgentRequest(req, method);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Agent API error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return run(req, "GET");
}
export async function POST(req: NextRequest) {
  return run(req, "POST");
}
export async function PATCH(req: NextRequest) {
  return run(req, "PATCH");
}
export async function PUT(req: NextRequest) {
  return run(req, "PUT");
}
export async function DELETE(req: NextRequest) {
  return run(req, "DELETE");
}
