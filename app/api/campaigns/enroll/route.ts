import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSMS } from "@/lib/twilio";
import { interpolateMessage, ensureE164, parseCampaignSteps } from "@/lib/utils";

const TIMEZONE = process.env.CRM_TIMEZONE || "America/New_York";
function getLocalHour(date: Date): number {
  return parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: TIMEZONE }).format(date));
}

export async function POST(req: NextRequest) {
  const { campaignId, leadIds, isDrip = true, targetHours = 6 } = await req.json();
  if (!campaignId || !leadIds?.length) return NextResponse.json({ error: "campaignId and leadIds required" }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const steps = parseCampaignSteps(campaign.steps);
  if (!steps.length) return NextResponse.json({ error: "Campaign has no steps" }, { status: 400 });

  let enrolled = 0;
  let sent = 0;

  // Initialize the time pointer for 9-5 scheduling
  let timePointer = new Date();
  
  if (isDrip) {
    // If before 9 AM, fast-forward to 9 AM today
    if (getLocalHour(timePointer) < 9) {
      timePointer.setHours(9, 0, 0, 0);
    }
    // If after 5 PM, fast-forward to 9 AM tomorrow
    else if (getLocalHour(timePointer) >= 17) {
      timePointer.setDate(timePointer.getDate() + 1);
      timePointer.setHours(9, 0, 0, 0);
    }
  }

  for (const leadId of leadIds) {
    const lead = await prisma.lead.findUnique({ 
      where: { id: leadId },
      include: { campaignLeads: true }
    });
    if (!lead) continue;

    // RULE: A lead can NEVER be enrolled in more than one campaign ever.
    if (lead.campaignLeads && lead.campaignLeads.length > 0) continue;

    // RULE: Just to be absolutely safe, if their status is not "new", skip them.
    if (lead.status !== "new") continue;

    const firstStep = steps[0];
    
    let nextSendAt = new Date(timePointer);
    nextSendAt.setDate(nextSendAt.getDate() + (firstStep.day_offset || 0));

    await prisma.campaignLead.upsert({
      where: { campaignId_leadId: { campaignId, leadId } },
      create: { campaignId, leadId, currentStep: 0, nextSendAt: new Date(nextSendAt), status: "active" },
      update: { status: "active", currentStep: 0, nextSendAt: new Date(nextSendAt) },
    });
    enrolled++;

    if (isDrip) {
      // 1. Calculate Base Delay exactly as requested
      const totalContacts = leadIds.length;
      const baseDelaySeconds = (targetHours * 3600) / totalContacts;
      
      // 2. Random Jitter (70% to 130%), minimum 2 seconds
      let minDelay = baseDelaySeconds * 0.7;
      let maxDelay = baseDelaySeconds * 1.3;
      minDelay = Math.max(2, minDelay);
      maxDelay = Math.max(2, maxDelay);
      const jitterDelaySeconds = minDelay + Math.random() * (maxDelay - minDelay);

      timePointer.setSeconds(timePointer.getSeconds() + jitterDelaySeconds);

      // 3. Ensure we stay in 9 AM - 5 PM bounds for natural sending
      if (getLocalHour(timePointer) >= 17) {
        timePointer.setDate(timePointer.getDate() + 1);
        timePointer.setHours(9, 0, 0, 0);
      }
    } else {
      // INSTANT SEND MODE (No Drip)
      if ((firstStep.day_offset || 0) === 0 && lead.phone) {
        const message = interpolateMessage(firstStep.message, lead);
        try {
          const { sid, status } = await sendSMS(ensureE164(lead.phone), message);
          await prisma.message.create({
            data: { leadId, campaignId, direction: "outbound", body: message, twilioSid: sid, status: status === "queued" || status === "sent" ? "queued" : "failed" },
          });
          await prisma.lead.update({ where: { id: leadId }, data: { status: "contacted" } });

          if (steps.length > 1) {
            const next = new Date();
            next.setDate(next.getDate() + steps[1].day_offset);
            await prisma.campaignLead.update({ where: { campaignId_leadId: { campaignId, leadId } }, data: { currentStep: 1, nextSendAt: next } });
          } else {
            await prisma.campaignLead.update({ where: { campaignId_leadId: { campaignId, leadId } }, data: { status: "completed" } });
          }
          sent++;
        } catch (err) { console.error(`SMS failed for ${lead.phone}:`, err); }
      }
    }
  }

  return NextResponse.json({ enrolled, sent, dripped: isDrip });
}




