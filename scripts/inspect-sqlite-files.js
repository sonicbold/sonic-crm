const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(db|db-wal|db-shm|db-journal)$/i.test(ent.name)) acc.push({ p, size: fs.statSync(p).size });
  }
  return acc;
}

(async () => {
  const files = walk(process.cwd());
  const url = "file:" + path.resolve("prisma/prisma/dev.db").replace(/\\/g, "/");
  const client = new PrismaClient({ datasources: { db: { url } } });
  let tables = [];
  let sample = null;
  try {
    tables = await client.$queryRawUnsafe("SELECT name, sql FROM sqlite_master WHERE type='table'");
    try {
      sample = await client.$queryRawUnsafe("SELECT COUNT(*) as c FROM Lead");
    } catch (e) {
      sample = { error: String(e.message).slice(0, 200) };
    }
  } catch (e) {
    tables = [{ error: String(e.message).slice(0, 240) }];
  } finally {
    await client["$disconnect"]();
  }
  const payload = {
    sessionId: "9903e8",
    runId: "pre-fix",
    hypothesisId: "B",
    location: "scripts/inspect-sqlite-files.js",
    message: "sqlite files and tables",
    data: { files, tables, sample },
    timestamp: Date.now(),
  };
  console.log(JSON.stringify(payload.data, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));
  await fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
    body: JSON.stringify(payload),
  });
})();
