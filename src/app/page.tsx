import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeOdds, formatPct, parseParData } from "@/lib/odds";
import { getCurrentUser } from "@/lib/auth";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

type GridMatch = Awaited<ReturnType<typeof loadMatches>>[number];

async function loadMatches(where: any, orderBy: any, take?: number) {
  return prisma.match.findMany({
    where,
    orderBy,
    take,
    include: {
      players: {
        orderBy: { seat: "asc" },
        include: {
          scores: true,
          _count: { select: { wagers: true } },
        },
      },
      _count: { select: { wagers: true } },
    },
  });
}

export default async function HomePage() {
  const user = await getCurrentUser();

  const open = await loadMatches(
    { status: { in: ["UPCOMING", "IN_PROGRESS"] } },
    [{ status: "asc" }, { scheduledAt: "asc" }],
  );
  const completed = await loadMatches(
    { status: "COMPLETED" },
    { completedAt: "desc" },
    6,
  );

  return (
    <div className="space-y-10">
      <AutoRefresh endpoint="/api/markets/state" />
      {!user && (
        <div className="card p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              The prediction market for your foursome.
            </h2>
            <p className="text-sm text-mute mt-1">
              Post your upcoming round. Friends call who wins. Odds move like a
              market. No money, just the trash talk.
            </p>
          </div>
          <Link href="/login" className="btn btn-primary shrink-0">
            Sign in to play
          </Link>
        </div>
      )}

      <section>
        <SectionHeader title="Live & upcoming" />
        {open.length === 0 ? (
          <EmptyCard>
            No open matches yet.{" "}
            {user ? (
              <Link className="text-accent" href="/matches/new">
                Post one →
              </Link>
            ) : (
              <Link className="text-accent" href="/login">
                Sign in to post one →
              </Link>
            )}
          </EmptyCard>
        ) : (
          <MatchGrid matches={open} />
        )}
      </section>

      <section>
        <SectionHeader title="Settled" />
        {completed.length === 0 ? (
          <EmptyCard>No completed matches yet.</EmptyCard>
        ) : (
          <MatchGrid matches={completed} settled />
        )}
      </section>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm uppercase tracking-wider text-mute">{title}</h2>
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-sm text-mute">{children}</div>;
}

function MatchGrid({
  matches,
  settled,
}: {
  matches: GridMatch[];
  settled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {matches.map((m) => {
        const odds = computeOdds({
          status: m.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
          holes: m.holes,
          pars: parseParData(m.parData, m.holes),
          players: m.players.map((p) => ({
            id: p.id,
            handicap: p.handicap,
            wagerCount: p._count.wagers,
            scoresByHole: Object.fromEntries(
              p.scores.map((s) => [s.hole, s.strokes]),
            ),
          })),
        });

        const sorted = [...m.players].sort(
          (a, b) =>
            (odds.probabilities[b.id] ?? 0) - (odds.probabilities[a.id] ?? 0),
        );

        return (
          <Link
            key={m.id}
            href={`/matches/${m.id}`}
            className="card p-4 hover:border-accent/40 transition-colors block"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">{m.courseName}</div>
              <StatusPill status={m.status} />
            </div>
            <div className="text-xs text-mute mb-3">
              {new Date(m.scheduledAt).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · "}
              {m.holes} holes
              {" · "}
              {m._count.wagers} wagers
            </div>
            <ul className="space-y-1.5">
              {sorted.map((p) => {
                const pct = odds.probabilities[p.id] ?? 0;
                return (
                  <li key={p.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="truncate">
                        {p.displayName}{" "}
                        <span className="text-mute text-xs">
                          · hcp {p.handicap}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-accent">
                        {formatPct(pct)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-panel2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/80"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {settled && (
              <div className="mt-3 text-xs text-mute">
                Final ·{" "}
                {m.completedAt
                  ? new Date(m.completedAt).toLocaleDateString()
                  : ""}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    UPCOMING: "bg-panel2 text-mute",
    IN_PROGRESS: "bg-accent/15 text-accent",
    COMPLETED: "bg-gold/10 text-gold",
  };
  const label: Record<string, string> = {
    UPCOMING: "Upcoming",
    IN_PROGRESS: "Live",
    COMPLETED: "Final",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${cls[status] ?? ""}`}>
      {label[status] ?? status}
    </span>
  );
}
