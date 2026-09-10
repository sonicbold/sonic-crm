export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeSentiment, generateReply } from "@/lib/ai-agent";
import { sendSMS, verifyTwilioSignature } from "@/lib/twilio";
import { ensureE164 } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    // Validate Twilio signature in production
    if (process.env.NODE_ENV !== "development") {
      if (!verifyTwilioSignature(req, rawBody)) {
        console.warn("Invalid Twilio signature — rejecting webhook");
        return new NextResponse("<Response></Response>", { status: 401, headers: { "Content-Type": "text/xml" } });
      }
    }
    const params = new URLSearchParams(rawBody);
    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const twilioSid = params.get("MessageSid") || "";

    if (!from || !body) return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

    const normalizedFrom = ensureE164(from);
    const lead = await prisma.lead.findFirst({
      where: { phone: { in: [from, normalizedFrom, from.replace("+1", ""), from.replace("+", "")] } },
    });

    if (!lead) return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

    // Check if we already processed this MessageSid (prevent duplicates if Twilio retries)
    const existingMsg = await prisma.message.findFirst({ where: { twilioSid } });
    if (existingMsg) return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });

    // Save the inbound message FIRST — never lose data
    const inboundMsg = await prisma.message.create({
      data: { leadId: lead.id, direction: "inbound", body, twilioSid, status: "delivered", sentiment: null, isInterested: null },
    });

    // Then try sentiment analysis — failure won't lose the message
    let sentiment: string | null = null;
    let isInterested: boolean | null = null;
    try {
      const analysis = await analyzeSentiment(body);
      sentiment = analysis.sentiment;
      isInterested = analysis.isInterested;
      await prisma.message.update({ where: { id: inboundMsg.id }, data: { sentiment, isInterested } });
    } catch (e) {
      console.error("Sentiment analysis failed, message saved without sentiment:", e);
    }

    let newLeadStatus = lead.status;
    if (sentiment === "opted_out") {
      newLeadStatus = "not_interested";
      await prisma.campaignLead.updateMany({ where: { leadId: lead.id, status: "active" }, data: { status: "opted_out" } });
    } else if (isInterested) {
      newLeadStatus = "interested";
      await prisma.campaignLead.updateMany({ where: { leadId: lead.id, status: "active" }, data: { status: "interested" } });
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { status: newLeadStatus } });

    if (sentiment !== "opted_out") {
      const history = await prisma.message.findMany({ where: { leadId: lead.id }, orderBy: { sentAt: "asc" }, take: 10 });
      try {
        const replyText = await generateReply(body, lead, history);
        const { sid } = await sendSMS(ensureE164(lead.phone), replyText);
        await prisma.message.create({
          data: { leadId: lead.id, direction: "outbound", body: replyText, twilioSid: sid, status: "queued", aiReplied: true },
        });
      } catch (e) {
        console.error("AI auto-reply failed:", e);
      }
    } else if (sentiment === "opted_out") {
      try {
        const optOutReply = "No worries! I've removed you from our list. Good luck with everything!";
        const { sid } = await sendSMS(ensureE164(lead.phone), optOutReply);
        await prisma.message.create({
          data: { leadId: lead.id, direction: "outbound", body: optOutReply, twilioSid: sid, status: "queued", aiReplied: true },
        });
      } catch (e) {}
    }
  } catch (err) {
    console.error("Webhook critical error:", err);
  } finally {
    // ALWAYS return 200 OK so Twilio doesn't retry
    return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}
