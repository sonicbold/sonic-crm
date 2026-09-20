const { PrismaClient } = require("@prisma/client");
const path = require("path");

async function q(file) {
  const url = "file:" + path.resolve(file).replace(/\\/g, "/");
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const leads = await client.$queryRawUnsafe("SELECT COUNT(*) as c FROM Lead");
    const jobs = await client.$queryRawUnsafe("SELECT COUNT(*) as c FROM SearchJob");
    const sample = await client.$queryRawUnsafe("SELECT city, state, businessName FROM Lead LIMIT 3");
    return {
      file,
      leads: Number(leads[0].c),
      jobs: Number(jobs[0].c),
      sample,
    };
  } catch (err) {
    return { file, error: String(err.message).slice(0, 200) };
  } finally {
    await client["$disconnect"]();
  }
}

(async () => {
  const data = {
    docker: await q("scripts/docker-dev.db"),
    nested: await q("prisma/prisma/dev.db"),
  };
  console.log(JSON.stringify(data, null, 2));
  await fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
    body: JSON.stringify({
      sessionId: "9903e8",
      runId: "pre-fix",
      hypothesisId: "B",
      location: "scripts/inspect-lead-counts.js",
      message: "lead counts in sqlite copies",
      data,
      timestamp: Date.now(),
    }),
  });
})();
