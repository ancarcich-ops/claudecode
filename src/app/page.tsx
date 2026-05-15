import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeOdds, formatPct, parseParData } from "@/lib/odds";
import { getCurrentUser } from "@/lib/auth";
import { getActiveGroupId, visibleMatchWhere } from "@/lib/groups";
import AutoRefresh from "@/components/AutoRefresh";
import LiveCardStats from "@/components/LiveCardStats";
import { StaggerGroup, StaggerItem } from "@/components/Stagger";
import EmptyIllustration from "@/components/EmptyIllustration";
import {
  computeStableford,
  computeSkins,
  isSideGameKind,
  type SideGameKind,
} from "@/lib/sideGames";

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
      sideGames: true,
    },
  });
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const activeGroupId = getActiveGroupId();
  const groupWhere = await visibleMatchWhere(user?.id ?? null, activeGroupId);

  const open = await loadMatches(
    { ...groupWhere, status: { in: ["UPCOMING", "IN_PROGRESS"] } },
    [{ status: "asc" }, { scheduledAt: "asc" }],
  );
  const live = open.filter((m) => m.status === "IN_PROGRESS");
  const upcoming = open.filter((m) => m.status === "UPCOMING");

  const completed = await loadMatches(
    { ...groupWhere, status: "COMPLETED" },
    { completedAt: "desc" },
    6,
  );

  return (
    <div className="space-y-10">
      <AutoRefresh endpoint="/api/markets/state" />
      {!user && (
        <div className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
              All your games.{" "}
              <span className="text-accent">One round.</span>
            </h2>
            <p className="text-sm text-mute mt-2">
              Wolf, Skins, Bingo Bango Bongo — same scorecard.
            </p>
          </div>
          <Link
            href="/login"
            className="btn btn-primary shrink-0 self-start sm:self-auto"
          >
            Open the line →
          </Link>
        </div>
      )}

      {live.length > 0 && (
        <section>
          <SectionHeader
            title="Live now"
            accent
            count={live.length}
          />
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {live.map((m) => (
              <StaggerItem key={m.id}>
                <LiveCard match={m} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>
      )}

      <section>
        <SectionHeader title="Upcoming" />
        {upcoming.length === 0 && live.length === 0 ? (
          <EmptyIllustration
            kind="noMatches"
            title="Quiet Saturday."
            body="No rounds on the board yet. Post a tee time so the market opens."
            action={
              user ? (
                <Link className="btn btn-primary text-sm" href="/matches/new">
                  Post a round →
                </Link>
              ) : (
                <Link className="btn btn-primary text-sm" href="/login">
                  Sign in to post →
                </Link>
              )
            }
          />
        ) : upcoming.length === 0 ? (
          <EmptyCard>Nothing on the tee. Open the next line.</EmptyCard>
        ) : (
          <MatchGrid matches={upcoming} />
        )}
      </section>

      <section>
        <SectionHeader title="Settled" />
        {completed.length === 0 ? (
          <EmptyCard>No closed lines yet.</EmptyCard>
        ) : (
          <MatchGrid matches={completed} settled />
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  accent,
  count,
}: {
  title: string;
  accent?: boolean;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {accent && (
        <span
          className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse"
          aria-hidden
        />
      )}
      <h2
        className={
          "text-sm uppercase tracking-wider " +
          (accent ? "text-accent font-medium" : "text-mute")
        }
      >
        {title}
      </h2>
      {typeof count === "number" && (
        <span className="text-xs text-mute">{count}</span>
      )}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-sm text-mute">{children}</div>;
}

// Score helpers for live cards. Computed per-player from raw ScoreEntry rows.
function playerLiveScore(
  p: GridMatch["players"][number],
  pars: number[],
): { holes: number; strokes: number; diff: number } | null {
  if (p.scores.length === 0) return null;
  const strokes = p.scores.reduce((s, x) => s + x.strokes, 0);
  const parThrough = p.scores.reduce(
    (s, x) => s + (pars[x.hole - 1] ?? 4),
    0,
  );
  return { holes: p.scores.length, strokes, diff: strokes - parThrough };
}

function fmtDiff(diff: number): string {
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function diffColor(diff: number): string {
  if (diff < 0) return "text-accent";
  if (diff === 0) return "text-gold";
  return "text-mute";
}

function LiveCard({ match: m }: { match: GridMatch }) {
  const pars = parseParData(m.parData, m.holes);
  const scoringMode = m.scoringMode as "NET" | "GROSS" | "CUSTOM";
  const odds = computeOdds({
    status: "IN_PROGRESS",
    holes: m.holes,
    pars,
    scoringMode,
    players: m.players.map((p) => ({
      id: p.id,
      handicap: p.handicap,
      wagerCount: p._count.wagers,
      scoresByHole: Object.fromEntries(
        p.scores.map((s) => [s.hole, s.strokes]),
      ),
    })),
  });

  // Match-level "thru X" is the max holes any player has logged.
  const maxThru = m.players.reduce(
    (max, p) => Math.max(max, p.scores.length),
    0,
  );

  // Current side-game totals per player. We compute these as one-off
  // leaderboards (not running series) since the home card shows snapshots.
  const enabledKinds: SideGameKind[] = (m.sideGames ?? [])
    .map((sg) => sg.kind)
    .filter(isSideGameKind);
  const sgPlayers = m.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    handicap: p.handicap,
    scoresByHole: Object.fromEntries(
      p.scores.map((s) => [s.hole, s.strokes]),
    ),
  }));
  const sideGamesData: {
    stableford?: Record<string, number>;
    skins?: Record<string, number>;
  } = {};
  if (enabledKinds.includes("STABLEFORD")) {
    const lb = computeStableford(sgPlayers, pars, m.holes, scoringMode);
    sideGamesData.stableford = Object.fromEntries(
      lb.rows.map((r) => [r.playerId, r.numeric]),
    );
  }
  if (enabledKinds.includes("SKINS")) {
    const lb = computeSkins(sgPlayers, pars, m.holes, scoringMode);
    sideGamesData.skins = Object.fromEntries(
      lb.rows.map((r) => [r.playerId, r.numeric]),
    );
  }

  return (
    <Link
      href={`/matches/${m.id}`}
      className="card p-4 block live-card border-accent/40 hover:border-accent/60 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold truncate">{m.courseName}</div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium inline-flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
            aria-hidden
          />
          Live · thru {maxThru}
        </span>
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
      <LiveCardStats
        players={m.players.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          handicap: p.handicap,
          probability: odds.probabilities[p.id] ?? 0,
          liveScore: playerLiveScore(p, pars),
        }))}
        sideGames={sideGamesData}
      />
    </Link>
  );
}

function MatchGrid({
  matches,
  settled,
}: {
  matches: GridMatch[];
  settled?: boolean;
}) {
  return (
    <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <StaggerItem key={m.id}>
          <Link
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
          </StaggerItem>
        );
      })}
    </StaggerGroup>
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
