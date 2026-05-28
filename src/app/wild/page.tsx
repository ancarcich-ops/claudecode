import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getWhoOrDefault } from "@/lib/identity";
import CravingCard from "@/components/CravingCard";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function WildPage() {
  const settings = await getSettings();
  const who = getWhoOrDefault();
  const wild = await prisma.craving.findMany({
    where: { isWild: true },
    orderBy: [{ stars: "desc" }, { cravedAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-ink">✨ Wild Combos</h1>
        <p className="text-sm text-mute">
          The legendary, the bizarre, the &quot;you ate <em>what</em>?&quot; — rate them with stars.
        </p>
      </div>

      {wild.length === 0 ? (
        <EmptyState
          emoji="✨"
          title="No wild ones yet"
          subtitle="When a craving gets weird, mark it ‘Wild combo’ while logging — it lands here for the hall of fame."
          ctaHref="/log"
          ctaLabel="Log a wild craving"
        />
      ) : (
        <div className="space-y-3">
          {wild.map((c) => (
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
    </div>
  );
}
