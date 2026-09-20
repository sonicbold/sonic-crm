const { PrismaClient } = require("@prisma/client");
const path = require("path");
const fs = require("fs");

async function sample(file) {
  const url = "file:" + path.resolve(file).replace(/\\/g, "/");
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await client.$queryRawUnsafe(
      "SELECT city, state, address, businessName FROM Lead LIMIT 9",
    );
    const streetCities = rows.filter((r) => /^\d/.test(String(r.city || "")));
    return {
      file,
      count: rows.length,
      streetCities: streetCities.length,
      rows: rows.map((r) => ({ city: r.city, state: r.state, business: r.businessName })),
    };
  } catch (err) {
    return { file, error: String(err.message).slice(0, 200) };
  } finally {
    await client["$disconnect"]();
  }
}

(async () => {
  const data = {
    fromDocker: await sample("prisma/from-docker.db"),
    snapshot: await sample("scripts/docker-dev.db"),
  };
  const line =
    JSON.stringify({
      sessionId: "9903e8",
      runId: "pre-fix",
      hypothesisId: "A",
      location: "scripts/inspect-cities.js",
      message: "city/state in docker sqlite",
      data,
      timestamp: Date.now(),
    }) + "\n";
  fs.appendFileSync("debug-9903e8.log", line);
  console.log(JSON.stringify(data, null, 2));
  await fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
    body: line,
  }).catch(() => {});
})();
