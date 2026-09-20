const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const cwd = process.cwd();
const envUrl = process.env.DATABASE_URL || "";
const candidates = [
  path.join(cwd, "prisma", "dev.db"),
  path.join(cwd, "prisma", "prisma", "dev.db"),
  path.join(cwd, "dev.db"),
];

async function countAt(url) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const total = await p.lead.count();
    const jobs = await p.searchJob.count();
    return { total, jobs };
  } catch (err) {
    return { error: err.message };
  } finally {
    await p.$disconnect();
  }
}

(async () => {
  const payload = {
    sessionId: "9903e8",
    runId: "pre-fix",
    hypothesisId: "B",
    location: "scripts/inspect-db.js",
    message: "sqlite file inventory",
    data: {
      cwd,
      envUrl,
      files: candidates.map((p) => ({
        p,
        exists: fs.existsSync(p),
        size: fs.existsSync(p) ? fs.statSync(p).size : 0,
      })),
    },
    timestamp: Date.now(),
  };

  payload.data.envDb = await countAt(envUrl || "file:./prisma/dev.db");
  payload.data.schemaRel = await countAt("file:./prisma/dev.db");
  payload.data.nested = await countAt("file:./prisma/prisma/dev.db");
  payload.data.prismaDev = await countAt("file:./dev.db");

  console.log(JSON.stringify(payload.data, null, 2));
  await fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
    body: JSON.stringify(payload),
  }).catch((e) => console.error("ingest failed", e.message));
})();
