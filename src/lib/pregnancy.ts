import { fruitForWeek, type FruitSize } from "./fruit";

// A full-term pregnancy is dated as 280 days (40 weeks) from the last
// menstrual period, which is also dueDate − 280 days. All the math here
// works backward from the due date the couple enters in Settings.
const TERM_DAYS = 280;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PregnancyProgress = {
  hasDueDate: boolean;
  week: number; // completed gestational weeks
  dayOfWeek: number; // 0-6 days into the current week
  trimester: 1 | 2 | 3;
  trimesterLabel: string;
  daysToGo: number;
  weeksToGo: number;
  progressPct: number; // 0-100, clamped
  dueDate: Date | null;
  fruit: FruitSize;
};

export function trimesterForWeek(week: number): 1 | 2 | 3 {
  if (week <= 13) return 1;
  if (week <= 27) return 2;
  return 3;
}

export function trimesterLabel(t: 1 | 2 | 3): string {
  return t === 1 ? "First trimester" : t === 2 ? "Second trimester" : "Third trimester";
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// Pregnancy snapshot for a given moment (defaults to now). `at` lets us stamp
// a craving with the week/trimester it was logged in even when viewed later.
export function pregnancyProgress(
  dueDate: Date | null | undefined,
  at: Date = new Date(),
): PregnancyProgress {
  if (!dueDate) {
    return {
      hasDueDate: false,
      week: 0,
      dayOfWeek: 0,
      trimester: 1,
      trimesterLabel: trimesterLabel(1),
      daysToGo: 0,
      weeksToGo: 0,
      progressPct: 0,
      dueDate: null,
      fruit: fruitForWeek(null),
    };
  }

  const due = startOfDay(dueDate);
  const today = startOfDay(at);
  const daysToGo = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  const daysPregnant = TERM_DAYS - daysToGo;
  const totalDays = Math.max(0, daysPregnant);
  const week = Math.max(0, Math.floor(totalDays / 7));
  const dayOfWeek = Math.max(0, totalDays % 7);
  const trimester = trimesterForWeek(week);

  return {
    hasDueDate: true,
    week,
    dayOfWeek,
    trimester,
    trimesterLabel: trimesterLabel(trimester),
    daysToGo: Math.max(0, daysToGo),
    weeksToGo: Math.max(0, Math.ceil(daysToGo / 7)),
    progressPct: Math.min(100, Math.max(0, (daysPregnant / TERM_DAYS) * 100)),
    dueDate: due,
    fruit: fruitForWeek(week),
  };
}
