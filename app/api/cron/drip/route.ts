import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSMS } from "@/lib/twilio";
import { interpolateMessage, ensureE164, parseCampaignSteps } from "@/lib/utils";

const TIMEZONE = process.env.CRM_TIMEZONE || "America/New_York";
function getLocalHour(date: Date): number {
  return parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: TIMEZONE }).format(date));
}

export async function GET(req: NextRequest) {
  const now = new Date();

  // Find all active campaign leads with due messages
  const dueLeads = await prisma.campaignLead.findMany({
    where: { status: "active", nextSendAt: { lte: now } },
    include: { lead: true, campaign: true },
    take: 100,
  });

  let sent = 0;
  let failed = 0;

  for (const cl of dueLeads) {
    const lead = cl.lead;
    const campaign = cl.campaign;
    if (!lead.phone) continue;

    const steps = parseCampaignSteps(campaign.steps);
    const stepIndex = cl.currentStep;

    if (stepIndex >= steps.length) {
      await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "completed" } });
      continue;
    }

    const step = steps[stepIndex];
    const message = interpolateMessage(step.message, lead);

        try {
      const { sid, status } = await sendSMS(ensureE164(lead.phone), message);
      await prisma.message.create({
        data: { leadId: lead.id, campaignId: campaign.id, direction: "outbound", body: message, twilioSid: sid, status: "queued" },
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "contacted" } });

      const nextStepIndex = stepIndex + 1;
      if (nextStepIndex < steps.length) {
        const nextStep = steps[nextStepIndex];
        const nextSendAtDate = new Date();
        nextSendAtDate.setDate(nextSendAtDate.getDate() + (nextStep.day_offset - step.day_offset));
        
        // Ensure follow-ups respect 9-5 window roughly
        if (getLocalHour(nextSendAtDate) >= 17) {
            nextSendAtDate.setDate(nextSendAtDate.getDate() + 1);
            nextSendAtDate.setHours(9, 0, 0, 0);
        } else if (getLocalHour(nextSendAtDate) < 9) {
            nextSendAtDate.setHours(9, 0, 0, 0);
        }

        await prisma.campaignLead.update({ where: { id: cl.id }, data: { currentStep: nextStepIndex, nextSendAt: nextSendAtDate } });
      } else {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "completed" } });
      }
      sent++;
    } catch (err) {
      console.error(`Drip SMS failed for ${lead.phone}:`, err);
      await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "paused" } });
      failed++;
    }

    // Micro-delay in cron to prevent Twilio concurrency bursts
    await new Promise(r => setTimeout(r, 2000));
  }

  return NextResponse.json({ processed: dueLeads.length, sent, failed, timestamp: now.toISOString() });
}



