export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { mapTelnyxStatus, verifyTelnyxSignature } from "@/features/inbox/telnyx";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (process.env.NODE_ENV !== "development") {
      if (!(await verifyTelnyxSignature(req, rawBody))) {
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as {
      data?: {
        event_type?: string;
        payload?: { id?: string; to?: { status?: string }[] };
      };
    };

    const messageId = event.data?.payload?.id || "";
    const telnyxStatus = event.data?.payload?.to?.[0]?.status || event.data?.event_type?.replace("message.", "");
    if (!messageId) return NextResponse.json({ ok: true });

    await prisma.message.updateMany({
      where: { twilioSid: messageId },
      data: { status: mapTelnyxStatus(telnyxStatus) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telnyx status callback error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
