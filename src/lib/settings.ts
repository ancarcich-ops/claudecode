import { prisma } from "./db";

const SINGLETON = "singleton";

// There is exactly one Settings row. getSettings upserts it so the very first
// page load (before anyone visits Settings) still has sane defaults.
export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON },
  });
}

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;
