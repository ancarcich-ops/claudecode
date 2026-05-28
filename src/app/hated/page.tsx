import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getWhoOrDefault } from "@/lib/identity";
import ListNav from "@/components/ListNav";
import AversionForm from "@/components/AversionForm";
import AversionItem from "@/components/AversionItem";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function HatedPage() {
  const settings = await getSettings();
  const who = getWhoOrDefault();
  const aversions = await prisma.aversion.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-4">
      <ListNav />

      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Foods Hated 🚫</h1>
        <p className="text-sm text-mute">
          The smells and tastes that are suddenly a hard no.
        </p>
      </div>

      <AversionForm who={who} />

      {aversions.length === 0 ? (
        <EmptyState
          emoji="🤢"
          title="Nothing hated yet"
          subtitle="Lucky! Add the first aversion above when one shows up."
        />
      ) : (
        <div className="space-y-3">
          {aversions.map((a) => (
            <AversionItem
              key={a.id}
              aversion={a}
              momName={settings.momName}
              partnerName={settings.partnerName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
