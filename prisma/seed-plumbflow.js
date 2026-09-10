const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log("Cleaning database...");
  await prisma.message.deleteMany({});
  await prisma.campaignLead.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.searchJob.deleteMany({});

  console.log("Seeding PlumbFlow Campaigns...");
  const c1 = await prisma.campaign.create({
    data: {
      name: "Cold Reactivation - Houston",
      status: "active",
      steps: JSON.stringify([
        { dayOffset: 0, time: "09:00", message: "Hi {name}, this is Maya from PlumbFlow. We help plumbers in {city} turn more missed calls into booked jobs. Want to see how it works?" },
        { dayOffset: 2, time: "11:00", message: "Quick follow-up, {name}. Is improving booked estimates a priority for {businessName} this month?" }
      ])
    }
  });

  const c2 = await prisma.campaign.create({
    data: {
      name: "Estimate Rehash Sequence",
      status: "paused",
      steps: JSON.stringify([
        { dayOffset: 1, time: "10:00", message: "Hey {name}, just checking in on the estimate for {businessName}. Did you have any questions?" }
      ])
    }
  });

  console.log("Seeding PlumbFlow Leads...");
  const leads = [
    { businessName: "Jenkins Plumbing & Rooter", name: "Tom Jenkins", phone: "+17135550101", city: "Houston", email: "tom@jenkinsrooter.com", source: "ai_scraper", status: "estimate_sent", rating: 4.8 },
    { businessName: "Elite Water Heaters", name: "Sarah Jones", phone: "+17135550102", city: "Houston", email: "sarah@elitewater.com", source: "ai_scraper", status: "contacted", rating: 4.5 },
    { businessName: "Rowe & Sons Plumbing", name: "Mike Rowe", phone: "+17135550103", city: "Houston", email: "mike@rowesons.com", source: "import", status: "won", rating: 4.9 },
    { businessName: "Wright Way Plumbing", name: "David Wright", phone: "+17135550104", city: "Houston", email: "david@wrightway.com", source: "import", status: "lost", rating: 3.8 },
    { businessName: "Blue Star Pipes", name: "Gary Blue", phone: "+17135550105", city: "Austin", email: "gary@bluestarpipes.com", source: "ai_scraper", status: "new", rating: 4.1 },
    { businessName: "Texas Rooter", name: "Bill Texas", phone: "+17135550106", city: "Dallas", email: "bill@txrooter.com", source: "ai_scraper", status: "new", rating: 4.6 },
    { businessName: "Apex Plumbing", name: "Apex Team", phone: "+17135550107", city: "Austin", email: "info@apex.com", source: "manual", status: "contacted", rating: 5.0 },
    { businessName: "Citywide Drains", name: "Mark Drain", phone: "+17135550108", city: "Dallas", email: "mark@citywide.com", source: "ai_scraper", status: "estimate_sent", rating: 4.2 },
  ];

  for (const l of leads) {
    await prisma.lead.create({ data: l });
  }

  console.log("Seed complete!");
}

seed().catch(console.error).finally(() => prisma.$disconnect());
