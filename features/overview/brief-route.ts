export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getOperatorBrief } from "@/features/overview/brief";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const brief = await getOperatorBrief(force);
    return NextResponse.json(brief);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Brief failed" },
      { status: 500 }
    );
  }
}
