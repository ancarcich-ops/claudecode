import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { categoryMeta } from "@/lib/categories";
import { pregnancyProgress } from "@/lib/pregnancy";
import Petals from "@/components/Petals";
import RecapShare from "@/components/RecapShare";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function RecapPage() {
  const settings = await getSettings();
  const prog = pregnancyProgress(settings.dueDate);

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const week = await prisma.craving.findMany({
    where: { cravedAt: { gte: since } },
    orderBy: { intensity: "desc" },
  });

  const newAversions = await prisma.aversion.count({ where: { createdAt: { gte: since } } });

  if (week.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold text-ink">Weekly recap 📸</h1>
        <EmptyState
          emoji="🗓️"
          title="No cravings this week (yet!)"
          subtitle="Once a few are logged, this becomes a sweet card you can text to family."
          ctaHref="/log"
          ctaLabel="Log a craving"
        />
      </div>
    );
  }

  // Headline numbers for the card.
  const catCounts = new Map<string, number>();
  for (const c of week) catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  const topCatKey = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topCat = topCatKey ? categoryMeta(topCatKey) : null;

  const strongest = week[0];
  const wildest = week.find((c) => c.isWild);
  const satisfied = week.filter((c) => c.satisfied).length;

  const headline = prog.hasDueDate
    ? `Week ${prog.week} · ${settings.babyName ?? "Baby"} is the size of a ${prog.fruit.fruit} ${prog.fruit.emoji}`
    : `${settings.momName}'s cravings this week`;

  const shareText = [
    `🌸 ${settings.momName}'s craving recap`,
    prog.hasDueDate ? `Week ${prog.week} — size of a ${prog.fruit.fruit} ${prog.fruit.emoji}` : null,
    `🍴 ${week.length} cravings this week`,
    topCat ? `Top flavor: ${topCat.emoji} ${topCat.label}` : null,
    strongest ? `Strongest: ${strongest.food}` : null,
    wildest ? `Wildest: ${wildest.food} ✨` : null,
    `✅ ${satisfied} satisfied`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Weekly recap 📸</h1>
      <p className="text-sm text-mute">Screenshot or share this with family.</p>

      <section className="card relative overflow-hidden bg-gradient-to-br from-accent/20 via-panel to-gold/10 p-6">
        <Petals count={6} />
        <div className="relative space-y-4 text-center">
          <p className="text-xs uppercase tracking-widest text-mute">This week with</p>
          <p className="font-display text-3xl font-semibold text-ink">{settings.momName} 🌸</p>
          <p className="text-sm font-semibold text-accent">{headline}</p>

          <div className="grid grid-cols-2 gap-3 pt-2 text-left">
            <Tile big={`${week.length}`} label="cravings" />
            <Tile big={`${satisfied}`} label="satisfied" />
            <Tile big={topCat ? topCat.emoji : "✨"} label={topCat ? `top: ${topCat.label}` : "top flavor"} />
            <Tile big={`${newAversions}`} label="new dislikes" />
          </div>

          {strongest && (
            <Line emoji="🔥" label="Strongest" value={strongest.food} />
          )}
          {wildest && <Line emoji="✨" label="Wildest" value={wildest.food} />}
        </div>
      </section>

      <RecapShare text={shareText} />
    </div>
  );
}

function Tile({ big, label }: { big: string; label: string }) {
  return (
    <div className="rounded-2xl bg-panel/70 p-3">
      <div className="font-display text-2xl font-bold text-ink">{big}</div>
      <div className="text-xs text-mute">{label}</div>
    </div>
  );
}

function Line({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-full bg-panel/70 px-4 py-2 text-sm">
      <span>{emoji}</span>
      <span className="text-mute">{label}:</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
