export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getOperatorBrief } from "@/features/overview/brief";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  return Response.json(await getOperatorBrief(force));
}
