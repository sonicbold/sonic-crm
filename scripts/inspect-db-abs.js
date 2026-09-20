const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

function toFileUrl(p) {
  return "file:" + path.resolve(p).replace(/\\/g, "/");
}

async function q(label, url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const leads = await client.lead.count();
    const jobs = await client.searchJob.count();
    return { label, url, leads, jobs };
  } catch (err) {
    return { label, url, error: String(err.message).slice(0, 240) };
  } finally {
    await client["$disconnect"]();
  }
}

(async () => {
  const files = ["prisma/dev.db", "prisma/prisma/dev.db", "dev.db"];
  const inventory = files.map((f) => ({
    f,
    abs: path.resolve(f),
    exists: fs.existsSync(f),
    size: fs.existsSync(f) ? fs.statSync(f).size : 0,
  }));
  const counts = [];
  counts.push(await q("env", process.env.DATABASE_URL || "file:./prisma/dev.db"));
  counts.push(await q("abs-nested", toFileUrl("prisma/prisma/dev.db")));
  counts.push(await q("abs-prisma-dev", toFileUrl("prisma/dev.db")));
  const payload = {
    sessionId: "9903e8",
    runId: "pre-fix",
    hypothesisId: "B",
    location: "scripts/inspect-db-abs.js",
    message: "absolute sqlite counts",
    data: { cwd: process.cwd(), inventory, counts },
    timestamp: Date.now(),
  };
  console.log(JSON.stringify(payload.data, null, 2));
  await fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
    body: JSON.stringify(payload),
  });
})();
