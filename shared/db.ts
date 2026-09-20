import { PrismaClient } from "@prisma/client";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// #region agent log
{
  const cwd = process.cwd();
  const dbUrl = process.env.DATABASE_URL || "";
  const prismaDev = path.join(cwd, "prisma", "dev.db");
  const nested = path.join(cwd, "prisma", "prisma", "dev.db");
  fetch("http://127.0.0.1:7866/ingest/e617e1c7-3fd6-486a-a1f7-ae85faba0110", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9903e8" },
    body: JSON.stringify({
      sessionId: "9903e8",
      runId: "post-fix",
      hypothesisId: "B",
      location: "lib/db.ts:init",
      message: "prisma sqlite path check",
      data: {
        cwd,
        dbUrl,
        prismaDevBytes: existsSync(prismaDev) ? statSync(prismaDev).size : -1,
        nestedBytes: existsSync(nested) ? statSync(nested).size : -1,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion
