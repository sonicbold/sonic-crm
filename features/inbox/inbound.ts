import { prisma } from "@/shared/db";
import { classifyReply, declineMessage, suggestInterestedReply } from "@/shared/gemini";
import { sendSMS } from "@/features/inbox/telnyx";
import { getConfig } from "@/shared/settings";
import { ensureE164 } from "@/shared/utils";

const DECLINE_INTENTS = new Set(["not_interested", "opted_out"]);

export async function handleInboundSms(leadId: string, inboundId: string, body: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  let intent: "interested" | "not_interested" | "opted_out" | "unclear" = "unclear";
  let confidence = 0.4;
  let reason = "";
  try {
    const classified = await classifyReply(body);
    intent = classified.intent;
    confidence = classified.confidence;
    reason = classified.reason;
  } catch (e) {
    console.error("Gemini classify failed:", e);
  }

  const isInterested = intent === "interested";
  const isDecline = DECLINE_INTENTS.has(intent);
  const sentiment = intent === "opted_out" ? "opted_out" : isInterested ? "positive" : isDecline ? "negative" : "neutral";

  await prisma.message.update({
    where: { id: inboundId },
    data: { sentiment, isInterested },
  });

  if (isDecline) {
    const goodbye = await declineMessage(lead);
    try {
      const { sid } = await sendSMS(ensureE164(lead.phone), goodbye);
      await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: "outbound",
          body: goodbye,
          twilioSid: sid,
          status: "queued",
          aiReplied: true,
        },
      });
    } catch (e) {
      console.error("Decline SMS failed:", e);
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: "not_interested",
        replied: true,
        archived: true,
        archivedAt: new Date(),
        lastInboundAt: new Date(),
        notes: [lead.notes, `Archived: ${reason || intent}`].filter(Boolean).join("\n"),
      },
    });
    await prisma.campaignLead.updateMany({
      where: { leadId: lead.id, status: { in: ["queued", "scheduled"] } },
      data: { status: "opted_out", nextSendAt: null },
    });
    await prisma.notification.create({
      data: {
        type: "declined",
        title: "Prospect archived",
        body: `${lead.businessName || lead.name || lead.phone} is not interested. Auto-reply sent and archived.`,
        leadId: lead.id,
      },
    });
    return;
  }

  const history = await prisma.message.findMany({
    where: { leadId: lead.id },
    orderBy: { sentAt: "asc" },
    take: 12,
  });

  let suggestion = "Thanks for getting back — want a quick 15-min call this week?";
  try {
    suggestion = await suggestInterestedReply(body, lead, history);
  } catch (e) {
    console.error("Gemini suggest failed:", e);
  }

  await prisma.suggestedReply.updateMany({
    where: { leadId: lead.id, status: "pending" },
    data: { status: "dismissed" },
  });
  await prisma.suggestedReply.create({
    data: { leadId: lead.id, inboundMessageId: inboundId, body: suggestion, status: "pending" },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: isInterested ? "interested" : lead.status === "new" ? "contacted" : lead.status,
      replied: true,
      lastInboundAt: new Date(),
      archived: false,
    },
  });

  const title = isInterested ? "Interested — review suggested reply" : "Reply needs your review";
  await prisma.notification.create({
    data: {
      type: "interest",
      title,
      body: `${lead.businessName || lead.name || lead.phone}: “${body.slice(0, 80)}”`,
      leadId: lead.id,
    },
  });

  const cfg = await getConfig();
  if (cfg.NOTIFY_PHONE && cfg.TELNYX_API_KEY) {
    try {
      await sendSMS(
        ensureE164(cfg.NOTIFY_PHONE),
        `Sonic CRM: ${lead.businessName || lead.phone} replied (${isInterested ? "interested" : "review"}). Open Inbox to send.`
      );
    } catch (e) {
      console.error("Owner notify SMS failed:", e);
    }
  }
}
