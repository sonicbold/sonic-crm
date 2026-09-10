export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    const messageSid = params.get("MessageSid") || "";
    const messageStatus = params.get("MessageStatus") || "";

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    // Map Twilio statuses to our DB statuses
    let dbStatus = "queued";
    if (["sent", "sending"].includes(messageStatus)) dbStatus = "sent";
    else if (messageStatus === "delivered") dbStatus = "delivered";
    else if (["failed", "undelivered"].includes(messageStatus)) dbStatus = "failed";

    await prisma.message.updateMany({
      where: { twilioSid: messageSid },
      data: { status: dbStatus },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Twilio status callback error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
