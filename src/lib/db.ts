import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Neon connection blips are transient: a cold-start after the compute
// autosuspends, or the pooler dropping a stale connection, surface as
// P1001 (can't reach), P1002 (timed out), or P1017 (server closed the
// connection). Without a retry these bubble up as a page-wide 500 --
// the whole site/app reads as down for a fault that clears in under a
// second. This middleware retries those (and only those) a couple
// times with a short backoff, so a blip becomes a hiccup. A genuine
// outage (compute cap hit, billing suspended, platform incident) still
// fails after the retries -- retry rides out a wake-up, it can't
// conjure a database that's hard-down.
const RETRYABLE_DB_CODES = new Set(["P1001", "P1002", "P1017"]);
const RETRY_BACKOFF_MS = [250, 750];

function makePrisma(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  client.$use(async (params, next) => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
      try {
        return await next(params);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (!code || !RETRYABLE_DB_CODES.has(code)) throw error;
        lastError = error;
        const wait = RETRY_BACKOFF_MS[attempt];
        if (wait == null) break; // out of retries -- rethrow below
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastError;
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
