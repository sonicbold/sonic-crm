const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function seed() {
  console.log("Cleaning database...");
  await prisma.message.deleteMany({});
  await prisma.campaignLead.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.searchJob.deleteMany({});

  await prisma.campaign.create({
    data: {
      name: "Houston plumber intro",
      status: "draft",
      description: "Single Telnyx blast",
      steps: JSON.stringify([
        { message: "Hi {{name}}, this is Jordan from FlowBoost. We help plumbers in {{city}} book more jobs through Google. Open to a 15-min chat this week?" },
      ]),
    },
  });

  const leads = [
    { businessName: "Jenkins Plumbing & Rooter", name: "Tom Jenkins", phone: "+17135550101", city: "Houston", email: "tom@jenkinsrooter.com", source: "ai_scraper", status: "new", rating: 4.8 },
    { businessName: "Elite Water Heaters", name: "Sarah Jones", phone: "+17135550102", city: "Houston", email: "sarah@elitewater.com", source: "ai_scraper", status: "contacted", rating: 4.5 },
    { businessName: "Rowe & Sons Plumbing", name: "Mike Rowe", phone: "+17135550103", city: "Houston", email: "mike@rowesons.com", source: "import", status: "interested", rating: 4.9 },
    { businessName: "Wright Way Plumbing", name: "David Wright", phone: "+17135550104", city: "Houston", email: "david@wrightway.com", source: "import", status: "not_interested", rating: 3.8 },
    { businessName: "Blue Star Pipes", name: "Gary Blue", phone: "+17135550105", city: "Austin", email: "gary@bluestarpipes.com", source: "ai_scraper", status: "new", rating: 4.1 },
    { businessName: "Texas Rooter", name: "Bill Texas", phone: "+17135550106", city: "Dallas", email: "bill@txrooter.com", source: "ai_scraper", status: "new", rating: 4.6 },
    { businessName: "Apex Plumbing", name: "Apex Team", phone: "+17135550107", city: "Austin", email: "info@apex.com", source: "manual", status: "contacted", rating: 5.0 },
    { businessName: "Citywide Drains", name: "Mark Drain", phone: "+17135550108", city: "Dallas", email: "mark@citywide.com", source: "ai_scraper", status: "new", rating: 4.2 },
  ];

  for (const l of leads) {
    await prisma.lead.create({ data: l });
  }

  console.log("Seed complete!");
}

seed().catch(console.error).finally(() => prisma.$disconnect());
