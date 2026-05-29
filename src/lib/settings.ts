import { prisma } from "./db";

const SINGLETON = "singleton";

// Used only by the local demo seed (prisma/seed.ts) to give Geena's sample
// data a due date. Production instances start with NO due date so each copy
// prompts its own owner to set one in Settings.
export const DEFAULT_DUE_DATE = new Date("2027-01-29T00:00:00");

// There is exactly one Settings row. getSettings upserts it so the very first
// page load (before anyone visits Settings) still has sane, generic defaults
// (name/partner/palette come from the schema defaults).
export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
}

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;
