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
const RETRY_BACKOFF_MS = [250, 750, 2000];

// A can't-reach / wake-up failure surfaces two different ways depending on
// whether the connection was already open:
//   - PrismaClientKnownRequestError with code P1001/P1002/P1017, OR
//   - PrismaClientInitializationError (thrown while (re)connecting), which
//     has NO `.code` -- the old check missed this entirely, so the most
//     common "Neon compute is waking up" failure was never retried.
// Match on the known P-codes, the init error's errorCode, and the message
// text of a connection/reach/timeout failure. We deliberately match the
// MESSAGE rather than the class name so we don't retry non-transient init
// errors (bad credentials, database-does-not-exist) that would only waste
// the backoff before failing anyway.
function isRetryableDbError(error: unknown): boolean {
  const e = error as { code?: string; errorCode?: string; message?: string };
  if (e?.code && RETRYABLE_DB_CODES.has(e.code)) return true;
  if (e?.errorCode && RETRYABLE_DB_CODES.has(e.errorCode)) return true;
  const msg = e?.message ?? "";
  return (
    msg.includes("Can't reach database server") ||
    msg.includes("Server has closed the connection") ||
    msg.includes("Timed out fetching a new connection") ||
    msg.includes("Connection terminated") ||
    msg.includes("Can't reach")
  );
}

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
        if (!isRetryableDbError(error)) throw error;
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
