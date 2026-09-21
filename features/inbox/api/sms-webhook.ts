export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/db";
import { verifyTelnyxSignature, mapTelnyxStatus } from "@/features/inbox/telnyx";
import { phoneLookupValues } from "@/shared/utils";
import { handleInboundSms } from "@/features/inbox/inbound";

type TelnyxEvent = {
  data?: {
    id?: string;
    event_type?: string;
    payload?: {
      id?: string;
      text?: string;
      from?: { phone_number?: string };
      to?: { phone_number?: string; status?: string }[];
    };
  };
};

function ok() {
  return NextResponse.json({ received: true });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (process.env.NODE_ENV !== "development") {
      if (!(await verifyTelnyxSignature(req, rawBody))) {
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
      }
    }

    let event: TelnyxEvent;
    try {
      event = JSON.parse(rawBody) as TelnyxEvent;
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const eventType = event.data?.event_type || "";
    const payload = event.data?.payload;
    const messageId = payload?.id || "";

    if (eventType === "message.received") {
      const from = payload?.from?.phone_number || "";
      const body = payload?.text || "";
      if (!from || !body) return ok();

      const lead = await prisma.lead.findFirst({
        where: { phone: { in: phoneLookupValues(from) } },
      });
      if (!lead) return ok();

      const existingMsg = await prisma.message.findFirst({ where: { twilioSid: messageId } });
      if (existingMsg) return ok();

      const lastOutbound = await prisma.message.findFirst({ where: { leadId: lead.id, direction: "outbound", campaignId: { not: null } }, orderBy: { sentAt: "desc" }, select: { campaignId: true, variant: true } });
      const inboundMsg = await prisma.message.create({
        data: { leadId: lead.id, campaignId: lastOutbound?.campaignId || null, variant: lastOutbound?.variant || 0, direction: "inbound", body, twilioSid: messageId, status: "delivered", sentiment: null, isInterested: null },
      });

      await handleInboundSms(lead.id, inboundMsg.id, body);
      return ok();
    }

    if (eventType.startsWith("message.")) {
      if (messageId) {
        const status = mapTelnyxStatus(payload?.to?.[0]?.status || eventType.replace("message.", ""));
        await prisma.message.updateMany({ where: { twilioSid: messageId }, data: { status } });
      }
    }
  } catch (err) {
    console.error("Webhook critical error:", err);
  }
  return ok();
}
