import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSMS } from "@/lib/twilio";
import { ensureE164 } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const { leadId, message } = await req.json();
  if (!leadId || !message) return NextResponse.json({ error: "leadId and message required" }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.phone) return NextResponse.json({ error: "Lead not found or missing phone" }, { status: 404 });

  try {
    const { sid, status } = await sendSMS(ensureE164(lead.phone), message);
    const msg = await prisma.message.create({
      data: { leadId, direction: "outbound", body: message, twilioSid: sid, status: "queued" },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { status: "contacted" } });
    return NextResponse.json({ success: true, messageId: msg.id, twilioSid: sid, status });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SMS failed" }, { status: 500 });
  }
}
