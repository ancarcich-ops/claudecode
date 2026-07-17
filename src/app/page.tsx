import Link from "next/link";
import MarketingLanding from "@/components/marketing/MarketingLanding";
import { prisma } from "@/lib/db";
import { computeOdds, formatPct, parseParData } from "@/lib/odds";
import { getCurrentUser } from "@/lib/auth";
import { autoCompleteStaleMatches } from "@/lib/autoComplete";
import { getActiveGroupId, visibleMatchWhere } from "@/lib/groups";
import AutoRefresh from "@/components/AutoRefresh";
import LiveCardStats from "@/components/LiveCardStats";
import MatchCard from "@/components/match-card/MatchCard";
import { buildMatchCardData } from "@/lib/matchCard";
import {
  computeTournamentLeaderboard,
  listTournamentsForUser,
} from "@/lib/tournaments";
import TournamentLeaderboardTable from "@/components/TournamentLeaderboardTable";
import {
  parseScrambleConfig,
  teamHandicap as scrambleTeamHandicap,
} from "@/lib/scramble";
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
      // Tournament context surfaces a "Tournament: <name> · Round N"
      // badge on the home feed card so foursomes inside a tournament
      // are visually distinct from standalone rounds.
      tournament: { select: { id: true, name: true } },
    },
  });
}

export default async function HomePage() {
  const user = await getCurrentUser();
  // Signed-out visitors get the real marketing landing (product,
  // company, and legal links) instead of the app feed -- this is the
  // page reviewers hit at the root domain, so it needs to read as an
  // established business site, not a bare app shell.
  if (!user) return <MarketingLanding />;
  // Close any finished-but-never-submitted rounds (all holes logged,
  // 1h+ idle) before building the feed, so they render as Final
  // instead of a permanent LIVE card.
  await autoCompleteStaleMatches().catch(() => {});
  const activeGroupId = getActiveGroupId();
  const groupWhere = await visibleMatchWhere(user?.id ?? null, activeGroupId);

  const open = await loadMatches(
    { ...groupWhere, status: { in: ["UPCOMING", "IN_PROGRESS"] } },
    [{ status: "asc" }, { scheduledAt: "asc" }],
  );
  const live = open.filter((m) => m.status === "IN_PROGRESS");
  const upcoming = open.filter((m) => m.status === "UPCOMING");

  // Bubble matches the signed-in user is actually PLAYING IN to the top
  // of each feed band (Live / Upcoming / Settled). Watching or wagering
  // doesn't count -- those still sort by the existing scheduledAt /
  // completedAt order. Partition is stable so the per-band sort is
  // preserved within each side.
  const playerInMatch = (m: GridMatch): boolean =>
    !!user && m.players.some((p) => p.userId === user.id);
  const reorderMine = (rows: GridMatch[]): GridMatch[] => {
    if (!user) return rows;
    const mine: GridMatch[] = [];
    const others: GridMatch[] = [];
    for (const m of rows) {
      if (playerInMatch(m)) mine.push(m);
      else others.push(m);
    }
    return [...mine, ...others];
  };

  const liveOrdered = reorderMine(live);
  const upcomingOrdered = reorderMine(upcoming);

  const completed = await loadMatches(
    { ...groupWhere, status: "COMPLETED" },
    { completedAt: "desc" },
    6,
  );
  // Past rounds are history -- strict most-recent-first. (Unlike Live /
  // Upcoming, we do NOT float "your" rounds to the top here: a finished
  // round you watched or played should sit in chronological order, not
  // sink below older rounds you happen to be linked to as a player.)
  const completedOrdered = completed;

  // Pull the current viewer's existing wagers across every match in view
  // in a single query so the QuickWagerButton can highlight the player
  // they've already called as "Picked".
  const allVisibleIds = [...live, ...upcoming, ...completed].map((m) => m.id);
  const myPicks = user && allVisibleIds.length > 0
    ? await prisma.wager.findMany({
        where: { userId: user.id, matchId: { in: allVisibleIds } },
        select: { matchId: true, pickedPlayerId: true },
      })
    : [];
  const myPickByMatch = new Map(
    myPicks.map((w) => [w.matchId, w.pickedPlayerId]),
  );

  // User's tournaments (created or rostered). Surfaced as its own
  // section so a "send a code, join from anywhere" tournament has a
  // homepage entry point -- otherwise the only way to find it is via
  // the group page or the direct URL.
  const myTournaments = user ? await listTournamentsForUser(user.id) : [];
  const activeTournaments = myTournaments.filter(
    (t) => t.status !== "COMPLETED",
  );
  // Recently-settled tournaments get their own collapsed-by-default
  // section below the match feed so the creator can still find them
  // without scrolling through everything they've ever run.
  const settledTournaments = myTournaments.filter(
    (t) => t.status === "COMPLETED",
  );
  // Compute leaderboards inline so the home feed can render the full
  // cross-foursome standings without making the user tap into each
  // tournament. Fan out across active + settled in parallel; one query
  // per tournament.
  const tournamentLeaderboards = await Promise.all(
    [...activeTournaments, ...settledTournaments].map(async (t) => {
      const rows = await computeTournamentLeaderboard(t.id);
      const roundCount = new Set(
        t.matches
          .map((m) => m.roundNumber)
          .filter((n): n is number => typeof n === "number"),
      ).size;
      return { tournamentId: t.id, rows, roundCount };
    }),
  );
  const leaderboardByTournament = new Map(
    tournamentLeaderboards.map((b) => [b.tournamentId, b]),
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

      {user && activeTournaments.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <SectionHeader title="Tournaments" />
            <Link
              href="/tournaments/new"
              className="btn btn-ghost text-xs whitespace-nowrap shrink-0"
            >
              + New tournament
            </Link>
          </div>
          <ul className="space-y-3">
            {activeTournaments.map((t) => {
              const completed = t.matches.filter(
                (m) => m.status === "COMPLETED",
              ).length;
              const board = leaderboardByTournament.get(t.id);
              return (
                <li key={t.id} className="card p-4 space-y-3">
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.name}
                      </div>
                      <div className="text-[11px] text-mute">
                        {t.scoringMode === "GROSS" ? "Gross" : "Net"} ·{" "}
                        {t.roster.length} player
                        {t.roster.length === 1 ? "" : "s"} · {completed}/
                        {t.roundsPlanned} rounds
                      </div>
                    </div>
                    <span className="chip text-[10px] shrink-0">
                      {t.status === "IN_PROGRESS" ? "Live" : "Upcoming"}
                    </span>
                  </Link>
                  {board && board.rows.length > 0 && (
                    <TournamentLeaderboardTable
                      rows={board.rows}
                      roundCount={board.roundCount}
                      scoringMode={t.scoringMode}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {live.length > 0 && (
        <section>
          <SectionHeader
            title="Live now"
            accent
            count={live.length}
          />
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {liveOrdered.map((m) => (
              <StaggerItem key={m.id}>
                <RenderedMatchCard
                  match={m}
                  myPickPlayerId={myPickByMatch.get(m.id) ?? null}
                />
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
            body="No rounds on the board yet. Post a tee time to start the round."
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
          <MatchGridNew matches={upcomingOrdered} myPickByMatch={myPickByMatch} />
        )}
      </section>

      <section>
        <SectionHeader title="Past rounds" />
        {completed.length === 0 ? (
          <EmptyCard>No closed lines yet.</EmptyCard>
        ) : (
          <MatchGridNew matches={completedOrdered} myPickByMatch={myPickByMatch} />
        )}
      </section>

      {user && settledTournaments.length > 0 && (
        <section>
          <SectionHeader title="Settled tournaments" />
          <ul className="space-y-3">
            {settledTournaments.map((t) => {
              const completedRounds = t.matches.filter(
                (m) => m.status === "COMPLETED",
              ).length;
              const board = leaderboardByTournament.get(t.id);
              return (
                <li key={t.id} className="card p-4 space-y-3 opacity-95">
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.name}
                      </div>
                      <div className="text-[11px] text-mute">
                        {t.scoringMode === "GROSS" ? "Gross" : "Net"} ·{" "}
                        {t.roster.length} player
                        {t.roster.length === 1 ? "" : "s"} ·{" "}
                        {completedRounds}/{t.roundsPlanned} rounds
                      </div>
                    </div>
                    <span className="chip text-[10px] shrink-0 text-gold border-gold/30">
                      Final
                    </span>
                  </Link>
                  {board && board.rows.length > 0 && (
                    <TournamentLeaderboardTable
                      rows={board.rows}
                      roundCount={board.roundCount}
                      scoringMode={t.scoringMode}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
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
// Computes odds once and feeds the normalized data through.
function buildCardData(m: GridMatch, myPickPlayerId: string | null) {
  const pars = parseParData(m.parData, m.holes);
  const scoringMode = m.scoringMode as "NET" | "GROSS" | "CUSTOM";
  const startingHole = m.startingHole ?? 1;

  // SCRAMBLE matches feed the odds engine 2 synthetic team inputs
  // instead of N per-player inputs -- mirrors what loadMatchWithOdds
  // does on the detail page so the home card line matches the detail
  // page's market. The probabilities engine emits keys "team-0" /
  // "team-1"; we remap to captain matchPlayerIds since buildMatchCardData's
  // synthetic cardPlayers carry the captain's id.
  const isScramble = m.format === "SCRAMBLE";
  let oddsInputs;
  let captainIdByTeam: Record<0 | 1, string | null> = { 0: null, 1: null };
  if (isScramble) {
    const config = parseScrambleConfig(m.scrambleConfig);
    const teams: Record<0 | 1, typeof m.players> = { 0: [], 1: [] };
    for (const p of m.players) {
      if (p.team === 0) teams[0].push(p);
      else if (p.team === 1) teams[1].push(p);
    }
    teams[0].sort((a, b) => a.seat - b.seat);
    teams[1].sort((a, b) => a.seat - b.seat);
    oddsInputs = ([0, 1] as const)
      .map((t) => {
        const roster = teams[t];
        if (roster.length === 0) return null;
        const captain = roster[0];
        captainIdByTeam[t] = captain.id;
        return {
          id: `team-${t}`,
          handicap: scrambleTeamHandicap(
            roster.map((r) => ({
              handicap: r.handicap,
              seat: r.seat,
              team: t,
              id: r.id,
              displayName: r.displayName,
            })),
            config.handicapMode,
            config.customAllowance?.[t],
          ),
          wagerCount: roster.reduce(
            (sum, r) => sum + r._count.wagers,
            0,
          ),
          scoresByHole: Object.fromEntries(
            captain.scores.map((s) => [s.hole, s.strokes]),
          ),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  } else {
    oddsInputs = m.players.map((p) => ({
      id: p.id,
      handicap: p.handicap,
      wagerCount: p._count.wagers,
      scoresByHole: Object.fromEntries(
        p.scores.map((s) => [s.hole, s.strokes]),
      ),
    }));
  }

  const odds = computeOdds({
    status: m.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
    holes: m.holes,
    startingHole,
    pars,
    scoringMode,
    players: oddsInputs,
  });

  // For scramble, remap team-0/team-1 -> captain matchPlayerId so the
  // card's per-player probability lookup hits.
  let probabilities = odds.probabilities;
  if (isScramble) {
    const remapped: Record<string, number> = {};
    for (const t of [0, 1] as const) {
      const captainId = captainIdByTeam[t];
      if (captainId) {
        remapped[captainId] = odds.probabilities[`team-${t}`] ?? 0;
      }
    }
    probabilities = remapped;
  }

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
    probabilities,
    myPickPlayerId,
  );
}

function RenderedMatchCard({
  match,
  myPickPlayerId,
}: {
  match: GridMatch;
  myPickPlayerId: string | null;
}) {
  return <MatchCard data={buildCardData(match, myPickPlayerId)} />;
}

function MatchGridNew({
  matches,
  myPickByMatch,
}: {
  matches: GridMatch[];
  myPickByMatch: Map<string, string>;
}) {
  return (
    <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {matches.map((m) => (
        <StaggerItem key={m.id}>
          <RenderedMatchCard
            match={m}
            myPickPlayerId={myPickByMatch.get(m.id) ?? null}
          />
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}
