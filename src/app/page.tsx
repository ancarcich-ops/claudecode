import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeOdds, formatPct, parseParData } from "@/lib/odds";
import { getCurrentUser } from "@/lib/auth";
import { getActiveGroupId, visibleMatchWhere } from "@/lib/groups";
import AutoRefresh from "@/components/AutoRefresh";
import LiveCardStats from "@/components/LiveCardStats";
import MatchCard from "@/components/match-card/MatchCard";
import { buildMatchCardData } from "@/lib/matchCard";
import { StaggerGroup, StaggerItem } from "@/components/Stagger";
import EmptyIllustration from "@/components/EmptyIllustration";
import PlayerAvatar from "@/components/Avatar";
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
          // Pull the player-user's avatar customization so cards can
          // render the real photo / picked variant, not just the default
          // seeded boring-avatar.
          user: {
            select: {
              id: true,
              username: true,
              avatarSeed: true,
              avatarVariant: true,
              avatarUrl: true,
            },
          },
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
                <RenderedMatchCard match={m} />
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
          <MatchGridNew matches={upcoming} />
        )}
      </section>

      <section>
        <SectionHeader title="Settled" />
        {completed.length === 0 ? (
          <EmptyCard>No closed lines yet.</EmptyCard>
        ) : (
          <MatchGridNew matches={completed} />
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


// Shared bridge between the prisma row and the redesigned MatchCard.
// We compute odds once and feed the normalized data through.
function buildCardData(m: GridMatch) {
  const pars = parseParData(m.parData, m.holes);
  const scoringMode = m.scoringMode as "NET" | "GROSS" | "CUSTOM";
  const startingHole = m.startingHole ?? 1;
  const odds = computeOdds({
    status: m.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
    holes: m.holes,
    startingHole,
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
  return buildMatchCardData(
    {
      ...m,
      players: m.players.map((p) => ({
        ...p,
        user: p.user
          ? {
              username: p.user.username,
              avatarSeed: p.user.avatarSeed,
              avatarVariant: p.user.avatarVariant,
              avatarUrl: p.user.avatarUrl,
            }
          : null,
      })),
    },
    odds.probabilities,
  );
}

function RenderedMatchCard({ match }: { match: GridMatch }) {
  return <MatchCard data={buildCardData(match)} />;
}

function MatchGridNew({ matches }: { matches: GridMatch[] }) {
  return (
    <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {matches.map((m) => (
        <StaggerItem key={m.id}>
          <RenderedMatchCard match={m} />
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}
