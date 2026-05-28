import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getWhoOrDefault } from "@/lib/identity";
import { CATEGORIES, categoryMeta } from "@/lib/categories";
import CravingCard from "@/components/CravingCard";
import ListNav from "@/components/ListNav";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function CravingsPage({
  searchParams,
}: {
  searchParams: { cat?: string; tri?: string };
}) {
  const settings = await getSettings();
  const who = getWhoOrDefault();

  const cat = searchParams.cat;
  const tri = searchParams.tri ? Number(searchParams.tri) : undefined;

  const cravings = await prisma.craving.findMany({
    where: {
      ...(cat ? { category: cat } : {}),
      ...(tri ? { trimester: tri } : {}),
    },
    orderBy: { cravedAt: "desc" },
  });

  // Only show category chips that actually have entries, to keep it tidy.
  const present = new Set(
    (await prisma.craving.groupBy({ by: ["category"], _count: true })).map((r) => r.category),
  );
  const chips = CATEGORIES.filter((c) => present.has(c.key));

  return (
    <div className="space-y-4">
      <ListNav />

      {chips.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <FilterChip href="/cravings" active={!cat} label="All" />
          {chips.map((c) => (
            <FilterChip
              key={c.key}
              href={`/cravings?cat=${c.key}`}
              active={cat === c.key}
              label={`${c.emoji} ${c.label}`}
            />
          ))}
        </div>
      )}

      {cravings.length === 0 ? (
        <EmptyState
          emoji={cat ? categoryMeta(cat).emoji : "🍓"}
          title={cat ? "Nothing in this category yet" : "No cravings logged yet"}
          subtitle="Tap the + below to add one."
          ctaHref="/log"
          ctaLabel="Log a craving"
        />
      ) : (
        <div className="space-y-3">
          {cravings.map((c) => (
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

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? "border-accent bg-accent/15 text-ink" : "border-border bg-panel2 text-mute"
      }`}
    >
      {label}
    </Link>
  );
}
