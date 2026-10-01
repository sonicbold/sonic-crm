/** External agent API under /api/v1. Auth is shared/api-auth.ts; handlers in agent-api.ts. */
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { requireAgentKey } from "@/shared/api-auth";
import { handleAgentRequest } from "@/features/agent/agent-api";

async function run(req: NextRequest, method: string) {
  const denied = await requireAgentKey(req);
  if (denied) return denied;
  return handleAgentRequest(req, method);
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
