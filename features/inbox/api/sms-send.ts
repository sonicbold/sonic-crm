/** One-off SMS from Inbox. Campaign drips use campaigns/drip-runner.ts instead. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { sendSMS } from "@/features/inbox/telnyx";
import { ensureE164 } from "@/shared/utils";
import { getConfig } from "@/shared/settings";
import { jsonError } from "@/shared/route";
import { logger } from "@/shared/log";

export async function POST(req: NextRequest) {
  const { leadId, message, suggestionId } = await req.json();
  if (!leadId || !message) return jsonError("inbox.sms", "leadId and message required", 400);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.phone) return jsonError("inbox.sms", "Lead not found or missing phone", 404);

  const cfg = await getConfig();
  if (!cfg.TELNYX_API_KEY || !cfg.TELNYX_PHONE_NUMBER) {
    return jsonError("inbox.sms", "Telnyx is not configured. Paste keys in Settings.", 400);
  }

  const { sid, status } = await sendSMS(ensureE164(lead.phone), message);
  const msg = await prisma.message.create({
    data: { leadId, direction: "outbound", body: message, twilioSid: sid, status: status === "failed" ? "failed" : "queued" },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { status: lead.status === "new" ? "contacted" : lead.status } });
  if (suggestionId) {
    await prisma.suggestedReply.updateMany({ where: { id: suggestionId, leadId }, data: { status: "sent" } });
  }
  logger("inbox.sms").info("sent", { leadId, messageId: msg.id, providerStatus: status });
  return NextResponse.json({ success: true, messageId: msg.id, providerSid: sid, status });
}
