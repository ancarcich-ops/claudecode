import { prisma } from "./db";

const SINGLETON = "singleton";

// Geena's due date, baked in so the week/trimester/fruit tracker works the
// moment the app boots in production. Editable any time in Settings — once
// the row exists, this default no longer overrides it.
export const DEFAULT_DUE_DATE = new Date("2027-01-29T00:00:00");

// There is exactly one Settings row. getSettings upserts it so the very first
// page load (before anyone visits Settings) still has sane defaults.
export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: SINGLETON },
    update: {},
    create: { id: SINGLETON, dueDate: DEFAULT_DUE_DATE },
  });
}

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;
