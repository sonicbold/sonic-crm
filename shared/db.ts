import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  websiteColumnReady?: Promise<void>;
};

let ensuringColumn = false;

function createPrisma() {
  const client = new PrismaClient({ log: ["error"] });
  client.$use(async (params, next) => {
    if (params.model === "Lead" && !ensuringColumn) await leadSchemaReady(client);
    return next(params);
  });
  return client;
}

async function addLeadColumn(client: PrismaClient, sql: string) {
  try {
    await client.$executeRawUnsafe(sql);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column/i.test(msg)) throw err;
  }
}

async function ensureWebsiteStatusColumn(client: PrismaClient) {
  await addLeadColumn(client, `ALTER TABLE "Lead" ADD COLUMN "websiteStatus" TEXT`);
  await addLeadColumn(client, `ALTER TABLE "Lead" ADD COLUMN "internalNotes" TEXT`);
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Lead_websiteStatus_idx" ON "Lead"("websiteStatus")`,
  );
}

function leadSchemaReady(client: PrismaClient) {
  if (!globalForPrisma.websiteColumnReady) {
    ensuringColumn = true;
    globalForPrisma.websiteColumnReady = ensureWebsiteStatusColumn(client).finally(() => {
      ensuringColumn = false;
    });
  }
  return globalForPrisma.websiteColumnReady;
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
