const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const sqliteUrl = "file:" + path.resolve("prisma/dev.db").replace(/\\/g, "/");
const prisma = new PrismaClient({ datasources: { db: { url: sqliteUrl } } });

(async () => {
  try {
    const dump = {
      leads: await prisma.lead.findMany(),
      searchJobs: await prisma.searchJob.findMany(),
      campaigns: await prisma.campaign.findMany(),
      campaignLeads: await prisma.campaignLead.findMany(),
      messages: await prisma.message.findMany(),
      appSettings: await prisma.appSetting.findMany(),
      notifications: await prisma.notification.findMany(),
      suggestedReplies: await prisma.suggestedReply.findMany(),
    };
    const dir = path.join("data", "exports");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "sqlite-backup.json"), JSON.stringify(dump, null, 2));
    console.log(
      JSON.stringify({
        leads: dump.leads.length,
        jobs: dump.searchJobs.length,
        campaigns: dump.campaigns.length,
        messages: dump.messages.length,
        settings: dump.appSettings.length,
      }),
    );
  } finally {
    await prisma["$disconnect"]();
  }
})();
