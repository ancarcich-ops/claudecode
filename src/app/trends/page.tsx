import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { categoryMeta } from "@/lib/categories";
import { CategoryPie, TopFoods, OverTime, TrimesterBars, type Slice, type Bar2 } from "@/components/charts";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const settings = await getSettings();
  const cravings = await prisma.craving.findMany({ orderBy: { cravedAt: "asc" } });

  if (cravings.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold text-ink">Trends 📊</h1>
        <EmptyState
          emoji="📊"
          title="No data to chart yet"
          subtitle="Log a few cravings and the trends will bloom here."
          ctaHref="/log"
          ctaLabel="Log a craving"
        />
      </div>
    );
  }

  // Category breakdown.
  const catCounts = new Map<string, number>();
  for (const c of cravings) catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  const categorySlices: Slice[] = [...catCounts.entries()]
    .map(([key, value]) => {
      const m = categoryMeta(key);
      return { name: m.label, value, color: m.color };
    })
    .sort((a, b) => b.value - a.value);

  // Top foods (normalized by lowercase, displayed with first-seen casing).
  const foodMap = new Map<string, { label: string; count: number }>();
  for (const c of cravings) {
    const key = c.food.trim().toLowerCase();
    const cur = foodMap.get(key);
    if (cur) cur.count += 1;
    else foodMap.set(key, { label: c.food.trim(), count: 1 });
  }
  const topFoods: Bar2[] = [...foodMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Over time: by pregnancy week when we have it, otherwise by month.
  const haveWeeks = cravings.some((c) => c.week != null);
  const otMap = new Map<string, number>();
  const orderKeys: string[] = [];
  for (const c of cravings) {
    const label = haveWeeks && c.week != null
      ? `wk ${c.week}`
      : c.cravedAt.toLocaleDateString(undefined, { month: "short" });
    if (!otMap.has(label)) orderKeys.push(label);
    otMap.set(label, (otMap.get(label) ?? 0) + 1);
  }
  const overTime: Bar2[] = orderKeys.map((label) => ({ label, count: otMap.get(label)! }));

  // Trimester distribution.
  const triCounts = [1, 2, 3].map((t) => ({
    label: t === 1 ? "1st" : t === 2 ? "2nd" : "3rd",
    count: cravings.filter((c) => c.trimester === t).length,
  }));
  const hasTrimester = triCounts.some((t) => t.count > 0);

  // Average intensity, for a headline stat.
  const avgIntensity = (
    cravings.reduce((s, c) => s + c.intensity, 0) / cravings.length
  ).toFixed(1);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Trends 📊</h1>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Cravings logged" value={cravings.length} />
        <Stat label="Avg intensity" value={`${avgIntensity} / 5`} />
      </div>

      <ChartCard title="By category" subtitle="Sweet, salty, sour & friends">
        <CategoryPie data={categorySlices} />
      </ChartCard>

      <ChartCard title="Most-craved foods" subtitle="Her greatest hits">
        <TopFoods data={topFoods} />
      </ChartCard>

      <ChartCard
        title={haveWeeks ? "Cravings by week" : "Cravings by month"}
        subtitle="When the cravings strike"
      >
        <OverTime data={overTime} />
      </ChartCard>

      {hasTrimester && (
        <ChartCard title="By trimester" subtitle="How appetite shifts over time">
          <TrimesterBars data={triCounts} />
        </ChartCard>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-mute">{subtitle}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4 text-center">
      <div className="font-display text-2xl font-bold text-ink">{value}</div>
      <div className="text-xs uppercase tracking-wide text-mute">{label}</div>
    </div>
  );
}
