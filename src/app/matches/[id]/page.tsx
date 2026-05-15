import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadMatchWithOdds } from "@/lib/match";
import { prisma } from "@/lib/db";
import {
  completeMatchAction,
  deleteMatchAction,
  placeWagerAction,
  reopenMatchAction,
  startMatchAction,
  updateHandicapAction,
  updateParsAction,
} from "@/lib/actions";
import { formatPct } from "@/lib/odds";
import { colorForSeat } from "@/lib/colors";
import {
  computeAllSideGames,
  isSideGameKind,
  ALL_SIDE_GAMES,
  runningStableford,
  runningSkins,
  runningNassauSegment,
  type SideGameKind,
} from "@/lib/sideGames";
import MatchChartTabs, {
  type SideGameSeries,
} from "./MatchChartTabs";
import MatchActionsMenu, { type MatchAction } from "./MatchActionsMenu";
import AutoRefresh from "@/components/AutoRefresh";
import ScoreSheet from "./ScoreSheet";
import WagerForm from "./WagerForm";
import ParsEditor from "./ParsEditor";
import HandicapInput from "./HandicapInput";

export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  const loaded = await loadMatchWithOdds(params.id);
  if (!loaded) notFound();
  const { match, odds, pars } = loaded;

  // Private-group gate: if this match is scoped to a group, only members can
  // see it. This is soft auth -- the cookie identity isn't verified -- but it
  // prevents stumbling on someone else's private round from a shared link.
  if (match.groupId) {
    if (!user) notFound();
    const isMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: match.groupId, userId: user.id } },
    });
    if (!isMember) notFound();
  }

  const scoringMode =
    match.scoringMode === "GROSS"
      ? "GROSS"
      : match.scoringMode === "CUSTOM"
        ? "CUSTOM"
        : "NET";
  const modeLabel =
    scoringMode === "GROSS"
      ? "Gross"
      : scoringMode === "CUSTOM"
        ? "Custom strokes"
        : "Net";
  const strokeFieldLabel =
    scoringMode === "CUSTOM" ? "strokes" : scoringMode === "GROSS" ? "hcp" : "hcp";
  const projLabel = scoringMode === "GROSS" ? "proj total" : "proj net";

  const myWager = user
    ? match.wagers.find((w) => w.userId === user.id) ?? null
    : null;
  const isCreator = !!user && match.createdById === user.id;
  const isCompleted = match.status === "COMPLETED";

  type Row = { t: number } & Record<string, number>;
  const rowMap = new Map<number, Row>();
  for (const snap of match.oddsSnapshots) {
    const t = snap.createdAt.getTime();
    const row = rowMap.get(t) ?? ({ t } as Row);
    row[snap.matchPlayerId] = snap.probability;
    rowMap.set(t, row);
  }
  const allRows = Array.from(rowMap.values()).sort((a, b) => a.t - b.t);

  // Two compressions so the chart only stretches when odds actually move:
  //  1. Drop a snapshot if every player's probability matches the previous
  //     one (a repeat wager / no-op edit shouldn't add a new step).
  //  2. Skip the trailing "now" point unless current odds differ from the
  //     last kept snapshot.
  const probsEqual = (a: Row, b: Row) =>
    match.players.every(
      (p) => Math.abs((a[p.id] ?? 0) - (b[p.id] ?? 0)) < 5e-4,
    );

  const series: Row[] = [];
  for (const row of allRows) {
    if (series.length === 0 || !probsEqual(series[series.length - 1], row)) {
      series.push(row);
    }
  }
  if (series.length > 0) {
    const current: Row = { t: Date.now() } as Row;
    for (const p of match.players) current[p.id] = odds.probabilities[p.id] ?? 0;
    if (!probsEqual(series[series.length - 1], current)) {
      series.push(current);
    }
  }

  const wagerCounts: Record<string, number> = {};
  for (const w of match.wagers) {
    wagerCounts[w.pickedPlayerId] = (wagerCounts[w.pickedPlayerId] ?? 0) + 1;
  }

  const playerMeta = match.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    displayName: p.displayName,
    handicap: p.handicap,
    color: colorForSeat(p.seat),
    wagerCount: wagerCounts[p.id] ?? 0,
    probability: odds.probabilities[p.id] ?? 0,
    netScore: odds.meta.netScores[p.id] ?? null,
    scores: p.scores.slice().sort((a, b) => a.hole - b.hole),
  }));

  // Side-game leaderboards. Filter persisted kinds against the known set in
  // case a kind was deprecated since this match was created.
  const enabledKinds: SideGameKind[] = (match.sideGames ?? [])
    .map((sg) => sg.kind)
    .filter(isSideGameKind);
  const sideGameSections = computeAllSideGames({
    enabled: enabledKinds,
    players: match.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      handicap: p.handicap,
      scoresByHole: Object.fromEntries(
        p.scores.map((s) => [s.hole, s.strokes]),
      ),
    })),
    pars,
    holes: match.holes,
    scoringMode,
  });
  const sideGameLabel: Record<SideGameKind, string> = Object.fromEntries(
    ALL_SIDE_GAMES.map((g) => [g.kind, g.label]),
  ) as Record<SideGameKind, string>;

  // Hole-by-hole running series for the chart tabs. Only built for enabled
  // side games; the tab control hides any kind whose series is undefined.
  const sgPlayers = match.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    handicap: p.handicap,
    scoresByHole: Object.fromEntries(
      p.scores.map((s) => [s.hole, s.strokes]),
    ),
  }));
  const sgSeries: SideGameSeries = {};
  if (enabledKinds.includes("STABLEFORD")) {
    sgSeries.stableford = runningStableford(
      sgPlayers,
      pars,
      match.holes,
      scoringMode,
    );
  }
  if (enabledKinds.includes("SKINS")) {
    sgSeries.skins = runningSkins(sgPlayers, pars, match.holes, scoringMode);
  }
  if (enabledKinds.includes("NASSAU") && match.holes === 18) {
    sgSeries.nassauF9 = runningNassauSegment(
      sgPlayers,
      pars,
      match.holes,
      scoringMode,
      1,
      9,
    );
    sgSeries.nassauB9 = runningNassauSegment(
      sgPlayers,
      pars,
      match.holes,
      scoringMode,
      10,
      18,
    );
    sgSeries.nassauTotal = runningNassauSegment(
      sgPlayers,
      pars,
      match.holes,
      scoringMode,
      1,
      18,
    );
  }

  return (
    <div className="space-y-6">
      <AutoRefresh endpoint={`/api/matches/${match.id}/state`} />

      <header>
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate flex-1 min-w-0">
            {match.courseName}
          </h1>
          <StatusBadge status={match.status} />
          {isCreator && (
            <MatchActionsMenu
              matchId={match.id}
              actions={creatorActions(match.status, {
                startMatchAction,
                completeMatchAction,
                reopenMatchAction,
                deleteMatchAction,
              })}
            />
          )}
        </div>
        <div className="text-xs sm:text-sm text-mute mt-1">
          {new Date(match.scheduledAt).toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {" · "}
          {match.holes}H · par {odds.meta.coursePar}
          {" · "}
          {modeLabel}
          {" · "}
          @{match.createdBy.username}
        </div>
        {match.notes && (
          <div className="text-sm text-mute mt-2 italic">
            &ldquo;{match.notes}&rdquo;
          </div>
        )}
      </header>

      <section className="card p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="text-sm uppercase tracking-wider text-mute">
            Market
          </h2>
          <div className="text-[11px] sm:text-xs text-mute font-mono whitespace-nowrap">
            model {(odds.weights.model * 100).toFixed(0)}% · crowd{" "}
            {(odds.weights.crowd * 100).toFixed(0)}% · live{" "}
            {(odds.weights.live * 100).toFixed(0)}%
          </div>
        </div>

        <MatchChartTabs
          oddsSeries={series}
          players={playerMeta.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            color: p.color,
          }))}
          sideGames={sgSeries}
        />

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {playerMeta.map((p) => (
            <div key={p.id} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: p.color }}
                  />
                  <span className="font-medium truncate">{p.displayName}</span>
                  {isCreator ? (
                    <HandicapInput
                      action={updateHandicapAction}
                      matchId={match.id}
                      matchPlayerId={p.id}
                      handicap={p.handicap}
                    />
                  ) : (
                    <span className="chip">
                      {strokeFieldLabel} {p.handicap}
                    </span>
                  )}
                </div>
                <div className="font-mono tabular-nums text-lg">
                  {formatPct(p.probability)}
                </div>
              </div>
              <div className="h-1.5 mt-2 bg-panel2 rounded-full overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${p.probability * 100}%`,
                    background: p.color,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-mute">
                <span>
                  {p.wagerCount} wager{p.wagerCount === 1 ? "" : "s"}
                </span>
                {p.netScore !== null && (
                  <span className="font-mono">
                    {projLabel} {p.netScore.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
          Place your call
        </h2>
        {!user ? (
          <div className="text-sm text-mute">
            <a className="text-accent" href="/login">
              Sign in
            </a>{" "}
            to place a call on this match.
          </div>
        ) : isCompleted ? (
          <div className="text-sm text-mute">
            Market closed. {myWager ? "Your final call is locked in." : ""}
          </div>
        ) : (
          <WagerForm
            action={placeWagerAction}
            matchId={match.id}
            players={playerMeta}
            currentPickId={myWager?.pickedPlayerId ?? null}
          />
        )}
        {match.wagers.length > 0 && (
          <div className="mt-4 text-xs text-mute">
            <span className="uppercase tracking-wider">Recent calls:</span>{" "}
            {match.wagers
              .slice(-8)
              .reverse()
              .map((w) => (
                <span key={w.id} className="mr-2">
                  @{w.user.username} → {w.pickedPlayer.displayName}
                </span>
              ))}
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wider text-mute">
            Scorecard
          </h2>
          <span className="text-xs text-mute">
            {odds.meta.holesPlayed}/{match.holes} holes logged
          </span>
        </div>
        {!user ? (
          <div className="text-sm text-mute">
            Sign in to log scores during the round.
          </div>
        ) : (
          <ScoreSheet
            matchId={match.id}
            holes={match.holes}
            pars={pars}
            players={playerMeta}
            locked={isCompleted}
          />
        )}
      </section>

      {sideGameSections.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
            Side games
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sideGameSections.map((sg) => (
              <div
                key={sg.kind}
                className="border border-border rounded-md p-3"
              >
                <div className="text-xs uppercase tracking-wider text-accent font-medium mb-2">
                  {sideGameLabel[sg.kind] ?? sg.kind}
                </div>
                <div className="space-y-3">
                  {sg.leaderboards.map((lb) => (
                    <div key={lb.key}>
                      {sg.leaderboards.length > 1 && (
                        <div className="text-[11px] text-mute mb-1">
                          {lb.title}
                        </div>
                      )}
                      {lb.subtitle && sg.leaderboards.length === 1 && (
                        <div className="text-[11px] text-mute mb-1">
                          {lb.subtitle}
                        </div>
                      )}
                      <ul className="space-y-1">
                        {lb.rows.map((r, i) => (
                          <li
                            key={r.playerId}
                            className="flex items-center justify-between text-sm"
                          >
                            <span
                              className={
                                "truncate " +
                                (r.isLeader ? "text-ink font-medium" : "text-mute")
                              }
                            >
                              {i + 1}. {r.player}
                            </span>
                            <span
                              className={
                                "font-mono tabular-nums shrink-0 " +
                                (r.isLeader ? "text-accent" : "text-mute")
                              }
                            >
                              {r.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isCreator && (
        <section className="card p-4">
          <ParsEditor
            action={updateParsAction}
            matchId={match.id}
            holes={match.holes}
            pars={pars}
          />
        </section>
      )}
    </div>
  );
}

type CreatorActionFns = {
  startMatchAction: (fd: FormData) => Promise<void>;
  completeMatchAction: (fd: FormData) => Promise<void>;
  reopenMatchAction: (fd: FormData) => Promise<void>;
  deleteMatchAction: (fd: FormData) => Promise<void>;
};

function creatorActions(status: string, fns: CreatorActionFns): MatchAction[] {
  const out: MatchAction[] = [];
  if (status === "UPCOMING") {
    out.push({ label: "Start match", action: fns.startMatchAction });
  }
  if (status === "IN_PROGRESS") {
    out.push({ label: "Mark final", action: fns.completeMatchAction });
  }
  if (status !== "UPCOMING") {
    out.push({ label: "Reopen", action: fns.reopenMatchAction });
  }
  out.push({
    label: "Delete match",
    action: fns.deleteMatchAction,
    tone: "danger",
  });
  return out;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    UPCOMING: "bg-panel2 text-mute border border-border",
    IN_PROGRESS: "bg-accent/15 text-accent border border-accent/30",
    COMPLETED: "bg-gold/10 text-gold border border-gold/30",
  };
  const label: Record<string, string> = {
    UPCOMING: "Upcoming",
    IN_PROGRESS: "Live",
    COMPLETED: "Final",
  };
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${
        map[status] ?? ""
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

