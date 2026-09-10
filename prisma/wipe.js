const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function wipe() {
  console.log("Wiping all fake data...");
  await prisma.message.deleteMany({});
  await prisma.campaignLead.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.searchJob.deleteMany({});
  
  console.log("Database wiped clean!");
}

wipe().catch(console.error).finally(() => prisma.$disconnect());
