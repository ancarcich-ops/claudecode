import Link from "next/link";
import Petals from "./Petals";
import type { AppSettings } from "@/lib/settings";
import { pregnancyProgress } from "@/lib/pregnancy";

export default function PregnancyHero({ settings }: { settings: AppSettings }) {
  const prog = pregnancyProgress(settings.dueDate);
  const baby = settings.babyName?.trim();

  return (
    <section className="card relative overflow-hidden bg-gradient-to-br from-accent/15 via-panel to-gold/10 p-5">
      <Petals />
      <div className="relative">
        <p className="font-display text-2xl font-semibold text-ink">
          Hi {settings.momName} 🌸
        </p>

        {prog.hasDueDate ? (
          <>
            <p className="mt-1 text-sm text-mute">
              Week <span className="font-bold text-ink">{prog.week}</span>
              {prog.dayOfWeek > 0 && <span className="text-ink"> +{prog.dayOfWeek}d</span>} ·{" "}
              {prog.trimesterLabel}
            </p>

            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-panel/70 p-3">
              <span className="text-4xl">{prog.fruit.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-mute">
                  {baby ? `${baby} is the size of a` : "Baby is the size of a"}
                </p>
                <p className="font-display text-lg font-semibold text-ink">
                  {prog.fruit.fruit}
                </p>
                <p className="truncate text-xs text-mute">{prog.fruit.note}</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-mute">
                <span>{Math.round(prog.progressPct)}% there</span>
                <span>{prog.daysToGo} days to go</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-panel2">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${prog.progressPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-mute">
                Due {prog.dueDate?.toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </>
        ) : (
          <div className="mt-3 rounded-2xl bg-panel/70 p-4 text-sm text-mute">
            <p>Add a due date and I&apos;ll track the week, trimester, and what fruit baby is this week. 🍓</p>
            <Link href="/settings" className="btn btn-primary mt-3 px-4 py-2 text-xs">
              Set due date
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
