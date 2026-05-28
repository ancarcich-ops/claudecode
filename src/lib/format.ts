// Friendly relative date like "Today", "Yesterday", "Tue" or "Mar 3".
export function relativeDay(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function timeLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function whoLabel(
  who: string | null | undefined,
  momName: string,
  partnerName: string,
): string {
  if (who === "geena") return momName;
  if (who === "daddy") return partnerName;
  if (who === "takeout") return "Takeout";
  return "—";
}
