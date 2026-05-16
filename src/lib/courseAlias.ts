// Course-name aliases. Different rounds may carry slightly different
// course names ("Alondra Park GC - North" vs "Alondra Park Golf Course")
// but represent the same physical course; normalizing here keeps Course
// Bests and any other per-course aggregation from double-counting.

const ALIASES: Record<string, string> = {
  "alondra park gc - north": "Alondra Park Golf Course",
  "alondra park gc north": "Alondra Park Golf Course",
  "alondra park north": "Alondra Park Golf Course",
  "alondra park": "Alondra Park Golf Course",
  "alondra park gc": "Alondra Park Golf Course",
};

export function normalizeCourseName(name: string): string {
  const key = name.trim().toLowerCase();
  return ALIASES[key] ?? name.trim();
}
