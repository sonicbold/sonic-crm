import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { sendSMS } from "@/features/inbox/telnyx";
import { ensureE164 } from "@/shared/utils";

import { getConfig } from "@/shared/settings";

export async function POST(req: NextRequest) {
  const { leadId, message, suggestionId } = await req.json();
  if (!leadId || !message) return NextResponse.json({ error: "leadId and message required" }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.phone) return NextResponse.json({ error: "Lead not found or missing phone" }, { status: 404 });

  const cfg = await getConfig();
  if (!cfg.TELNYX_API_KEY || !cfg.TELNYX_PHONE_NUMBER) {
    return NextResponse.json({ error: "Telnyx is not configured. Paste keys in Settings." }, { status: 400 });
  }

  try {
    const { sid, status } = await sendSMS(ensureE164(lead.phone), message);
    const msg = await prisma.message.create({
      data: { leadId, direction: "outbound", body: message, twilioSid: sid, status: status === "failed" ? "failed" : "queued" },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { status: lead.status === "new" ? "contacted" : lead.status } });
    if (suggestionId) {
      await prisma.suggestedReply.updateMany({ where: { id: suggestionId, leadId }, data: { status: "sent" } });
    }
    return NextResponse.json({ success: true, messageId: msg.id, providerSid: sid, status });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SMS failed" }, { status: 500 });
  }
}
