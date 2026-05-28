import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getWhoOrDefault } from "@/lib/identity";
import { categoryMeta } from "@/lib/categories";
import PregnancyHero from "@/components/PregnancyHero";
import CravingCard from "@/components/CravingCard";
import Scoreboard from "@/components/Scoreboard";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getSettings();
  const who = getWhoOrDefault();

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [recent, total, weekCount, satisfiedRows, unmet, byCategory] =
    await Promise.all([
      prisma.craving.findMany({ orderBy: { cravedAt: "desc" }, take: 3 }),
      prisma.craving.count(),
      prisma.craving.count({ where: { cravedAt: { gte: since } } }),
      prisma.craving.groupBy({
        by: ["satisfiedBy"],
        where: { satisfied: true },
        _count: true,
      }),
      prisma.craving.count({ where: { satisfied: false } }),
      prisma.craving.groupBy({ by: ["category"], _count: true }),
    ]);

  const satCount = (key: string) =>
    satisfiedRows.find((r) => r.satisfiedBy === key)?._count ?? 0;

  const topCat = byCategory.sort((a, b) => b._count - a._count)[0];
  const topCatMeta = topCat ? categoryMeta(topCat.category) : null;

  return (
    <div className="space-y-5">
      <PregnancyHero settings={settings} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={total} emoji="🍴" />
        <Stat label="This week" value={weekCount} emoji="📅" />
        <Stat
          label="Top craving"
          value={topCatMeta ? topCatMeta.label : "—"}
          emoji={topCatMeta ? topCatMeta.emoji : "✨"}
        />
      </div>

      <Link href="/log" className="btn btn-primary w-full py-3.5 text-base">
        + Log a craving
      </Link>

      {total > 0 && (
        <Scoreboard
          daddy={satCount("daddy")}
          geena={satCount("geena")}
          takeout={satCount("takeout")}
          unmet={unmet}
          momName={settings.momName}
          partnerName={settings.partnerName}
        />
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Latest cravings</h2>
        {total > 3 && (
          <Link href="/cravings" className="text-sm font-semibold text-accent">
            See all →
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        <EmptyState
          emoji="🍓"
          title="No cravings yet"
          subtitle="Tap the + to log the first one. Geena, that means you too!"
          ctaHref="/log"
          ctaLabel="Log a craving"
        />
      ) : (
        <div className="space-y-3">
          {recent.map((c) => (
            <CravingCard
              key={c.id}
              craving={c}
              who={who}
              momName={settings.momName}
              partnerName={settings.partnerName}
            />
          ))}
        </div>
      )}

      <Link
        href="/recap"
        className="card flex items-center justify-between p-4 text-sm font-semibold text-ink"
      >
        <span>📸 This week&apos;s recap card</span>
        <span className="text-accent">→</span>
      </Link>
    </div>
  );
}

function Stat({ label, value, emoji }: { label: string; value: string | number; emoji: string }) {
  return (
    <div className="card flex flex-col items-center gap-0.5 p-3 text-center">
      <span className="text-xl">{emoji}</span>
      <span className="truncate font-display text-lg font-bold text-ink">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-mute">{label}</span>
    </div>
  );
}
