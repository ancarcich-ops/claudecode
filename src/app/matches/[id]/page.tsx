import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadMatchWithOdds } from "@/lib/match";
import { prisma } from "@/lib/db";
import { canViewMatch } from "@/lib/groups";
import {
  completeMatchAction,
  deleteMatchAction,
  placeWagerAction,
  reopenMatchAction,
  startMatchAction,
  updateHandicapAction,
  saveCourseParsAction,
  updateParsAction,
} from "@/lib/actions";
import { formatPct } from "@/lib/odds";
import { colorForSeat } from "@/lib/colors";
import {
  computeAllSideGames,
  isSideGameKind,
  isBbbEventKind,
  isSnakeEventKind,
  isWolfEventKind,
  ALL_SIDE_GAMES,
  runningStableford,
  runningSkins,
  runningNassauSegment,
  runningBbb,
  runningSnake,
  runningWolf,
  shapeWolfHoles,
  parseWolfConfig,
  type SideGameKind,
  type BbbEvent,
  type SnakeEvent,
  type WolfEvent,
} from "@/lib/sideGames";
import MatchChartTabs, {
  type SideGameSeries,
} from "./MatchChartTabs";
import MatchActionsMenu, { type MatchAction } from "./MatchActionsMenu";
import MatchTabs, { type MatchTab } from "./MatchTabs";
import ShareButton from "@/components/ShareButton";
import BBBEditor from "./BBBEditor";
import SnakeEditor from "./SnakeEditor";
import WolfEditor from "./WolfEditor";
import WolfSettings from "./WolfSettings";
import WinCelebration from "@/components/WinCelebration";
import OnCourseMode from "./OnCourseMode";
import HoleStudyMode from "./HoleStudyMode";
import { getCourseHazardsByName, getCourseHolesByName } from "@/lib/course";
import { getWindForCoord } from "@/lib/weather";
import AutoRefresh from "@/components/AutoRefresh";
import Scorecard from "./Scorecard";
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

  // Visibility gate: mirrors visibleMatchWhere's cross-group rules. A user
  // can view a match if it's public, or they're in its posted-to group, or
  // they share any group with one of the match's linked players.
  if (
    !(await canViewMatch(user?.id ?? null, {
      groupId: match.groupId,
      players: match.players.map((p) => ({ userId: p.userId })),
    }))
  ) {
    notFound();
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
  // Score-edit permission: creator + any user linked to a seat. Non-players
  // see the scorecard but can't edit. Server action enforces the same gate.
  const isLinkedPlayer =
    !!user && match.players.some((p) => p.userId === user.id);
  const canLogScores = !isCompleted && (isCreator || isLinkedPlayer);

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
  // Append a trailing "now" point if current odds differ from the
  // last persisted snapshot. SCRAMBLE matches need a special lookup:
  // odds.probabilities is keyed by team-0 / team-1, not player IDs,
  // so a naive odds.probabilities[p.id] returns undefined for every
  // teammate and the chart's last data point would crash to 0% on
  // both lines.
  const isScrambleForOddsLookup = match.format === "SCRAMBLE";
  const probabilityFor = (p: (typeof match.players)[number]): number => {
    if (isScrambleForOddsLookup) {
      const team = p.team;
      if (team !== 0 && team !== 1) return 0;
      return odds.probabilities[`team-${team}`] ?? 0;
    }
    return odds.probabilities[p.id] ?? 0;
  };
  if (series.length > 0) {
    const current: Row = { t: Date.now() } as Row;
    for (const p of match.players) current[p.id] = probabilityFor(p);
    if (!probsEqual(series[series.length - 1], current)) {
      series.push(current);
    }
  }

  // Once the round has started, the chart switches its x-axis from
  // time-based to hole-based -- a long flat line at 50% for an idle
  // wager-free hour reads as "broken chart" to most viewers. Bucketing
  // by hole shows the actual round shape: where the line moved, and
  // when.
  //
  // "Round started" = any score entry exists. Pre-match (no scores)
  // keeps the time-based view so the build-up of opening calls is
  // still legible.
  const scoreEvents: { hole: number; t: number }[] = [];
  for (const p of match.players) {
    for (const s of p.scores) {
      scoreEvents.push({ hole: s.hole, t: s.createdAt.getTime() });
    }
  }
  const earliestPerHole = new Map<number, number>();
  for (const e of scoreEvents) {
    const prev = earliestPerHole.get(e.hole);
    if (prev == null || e.t < prev) earliestPerHole.set(e.hole, e.t);
  }
  const roundStarted = earliestPerHole.size > 0;

  type HoleRow = { hole: number } & Record<string, number>;
  let oddsXMode: "time" | "hole" = "time";
  let oddsHoleSeries: HoleRow[] | null = null;

  if (roundStarted) {
    oddsXMode = "hole";
    // Map each snapshot to the hole that was active at its timestamp.
    // Hole-at-time T = max hole whose earliest score was logged at or
    // before T. Snapshots before any score entry land in bucket 0
    // ("pre-round" -- shown as the leading point on the chart).
    const holeStartPairs = Array.from(earliestPerHole.entries()).sort(
      (a, b) => a[0] - b[0],
    );
    function holeAtTime(t: number): number {
      let h = 0;
      for (const [hole, startT] of holeStartPairs) {
        if (startT <= t && hole > h) h = hole;
      }
      return h;
    }
    // Last snapshot per hole bucket -- later overwrites earlier so we
    // keep the most recent odds in each bucket. Map preserves insert
    // order, but we sort by hole at the end to be safe.
    const byHole = new Map<number, Row>();
    for (const row of series) byHole.set(holeAtTime(row.t), row);
    const sortedHoles = Array.from(byHole.keys()).sort((a, b) => a - b);
    oddsHoleSeries = sortedHoles.map((h) => {
      const row = byHole.get(h)!;
      const out: HoleRow = { hole: h } as HoleRow;
      for (const p of match.players) out[p.id] = row[p.id] ?? 0;
      return out;
    });
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

  // displayEntities is what every player-facing view renders against.
  // For INDIVIDUAL matches it's identical to playerMeta; for SCRAMBLE
  // it collapses each team into a single entity carrying the captain's
  // matchPlayerId (so existing per-player server actions keep working
  // unchanged), the team's name + roster as the display label, the
  // team handicap, and the team's probability/net score from the odds
  // engine. The scorecard, market chart, market sidebar, and wager
  // form all read this list -- so a 4-person scramble shows 2 rows
  // everywhere instead of 4.
  let displayEntities = playerMeta;
  if (match.format === "SCRAMBLE") {
    const { partitionTeams, captainForTeam, teamHandicap, teamLabel, parseScrambleConfig } =
      await import("@/lib/scramble");
    const scrambleConfig = parseScrambleConfig(match.scrambleConfig);
    const teams = partitionTeams(match.players);
    const built = ([0, 1] as const)
      .map((t) => {
        const team = teams[t];
        if (team.length === 0) return null;
        const captain = captainForTeam(team)!;
        const roster = team
          .map((p) => p.displayName)
          .join(" & ");
        // Team color uses the captain's seat color so existing
        // per-seat colour helpers (charts, badges) stay consistent.
        return {
          id: captain.id,
          seat: captain.seat,
          displayName: `${teamLabel(t, scrambleConfig)} — ${roster}`,
          handicap: teamHandicap(team, scrambleConfig.handicapMode),
          color: colorForSeat(captain.seat),
          wagerCount: team.reduce(
            (sum, p) => sum + (wagerCounts[p.id] ?? 0),
            0,
          ),
          probability: odds.probabilities[`team-${t}`] ?? 0,
          netScore: odds.meta.netScores[`team-${t}`] ?? null,
          // Scores live on the captain's row -- the score-logging
          // server action takes a matchPlayerId, so writing through
          // the captain Just Works.
          scores: captain.scores.slice().sort((a, b) => a.hole - b.hole),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (built.length > 0) displayEntities = built;
  }

  // On-course GPS data: per-hole green coordinates for this course, plus
  // the signed-in user's match-player id (if any) so they can log scores
  // directly from the on-course view.
  // Lazy-seed course data from OpenStreetMap the first time anyone opens
  // a match for this course. importCourseFromOsm is idempotent + caches
  // forever, so subsequent visits are no-ops. Awaited so the first visitor
  // sees the populated map (adds ~2-5s to that one render).
  const { importCourseFromOsm } = await import("@/lib/actions");
  await importCourseFromOsm(match.courseName, match.holes).catch(() => {
    // Network fail / OSM down -- proceed with whatever data we have.
  });

  const [holeGeoByHole, hazardsByHole] = await Promise.all([
    getCourseHolesByName(match.courseName),
    getCourseHazardsByName(match.courseName),
  ]);
  // Pull a wind reading at the course's most-confident location. We use
  // any hole's green center we already know -- the course bounds are tiny
  // (~1km), so any hole's coord is representative. Skipped on courses
  // with no marked greens yet.
  const anyGreen = Object.values(holeGeoByHole).find(
    (h) => h.greenLat != null && h.greenLng != null,
  );
  const wind = anyGreen
    ? await getWindForCoord(anyGreen.greenLat as number, anyGreen.greenLng as number)
    : null;
  const myMatchPlayer = user
    ? match.players.find((p) => p.userId === user.id)
    : null;
  // Suggest starting on the hole after the user's last logged score; or
  // the max thru of the whole match if the user isn't a player.
  const userLastHole = myMatchPlayer
    ? myMatchPlayer.scores.reduce((m, s) => Math.max(m, s.hole), 0)
    : 0;
  const groupLastHole = match.players.reduce(
    (m, p) => Math.max(m, p.scores.reduce((mm, s) => Math.max(mm, s.hole), 0)),
    0,
  );
  // For a back-9 match, hole numbers run match.startingHole..match.startingHole+match.holes-1.
  const matchStart = match.startingHole ?? 1;
  const matchEnd = matchStart + match.holes - 1;
  const onCourseStartingHole = Math.max(
    matchStart,
    Math.min(matchEnd, (userLastHole || groupLastHole) + 1),
  );

  // Side-game leaderboards. Filter persisted kinds against the known set in
  // case a kind was deprecated since this match was created.
  const enabledKinds: SideGameKind[] = (match.sideGames ?? [])
    .map((sg) => sg.kind)
    .filter(isSideGameKind);
  // BBB and Snake events live on their SideGame rows; pull and normalize.
  const bbbGame = (match.sideGames ?? []).find((sg) => sg.kind === "BBB");
  const bbbEvents: BbbEvent[] = (bbbGame?.events ?? [])
    .filter((e) => isBbbEventKind(e.kind))
    .map((e) => ({
      hole: e.hole,
      kind: e.kind as BbbEvent["kind"],
      matchPlayerId: e.matchPlayerId ?? null,
    }));
  const snakeGame = (match.sideGames ?? []).find((sg) => sg.kind === "SNAKE");
  const snakeEvents: SnakeEvent[] = (snakeGame?.events ?? [])
    .filter((e) => isSnakeEventKind(e.kind) && e.matchPlayerId)
    .map((e) => ({
      hole: e.hole,
      matchPlayerId: e.matchPlayerId as string,
    }));
  const wolfGame = (match.sideGames ?? []).find((sg) => sg.kind === "WOLF");
  const wolfEvents: WolfEvent[] = (wolfGame?.events ?? [])
    .filter((e) => isWolfEventKind(e.kind))
    .map((e) => ({
      hole: e.hole,
      kind: e.kind as WolfEvent["kind"],
      matchPlayerId: e.matchPlayerId ?? null,
    }));
  const wolfConfig = parseWolfConfig(wolfGame?.config ?? null);
  const seatedWolfPlayers = match.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    displayName: p.displayName,
    handicap: p.handicap,
    scoresByHole: Object.fromEntries(
      p.scores.map((s) => [s.hole, s.strokes]),
    ),
  }));
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
    wolfPlayers: seatedWolfPlayers,
    pars,
    holes: match.holes,
    scoringMode,
    startingHole: matchStart,
    bbbEvents,
    snakeEvents,
    wolfEvents,
    wolfConfig,
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
      matchStart,
    );
  }
  if (enabledKinds.includes("SKINS")) {
    sgSeries.skins = runningSkins(
      sgPlayers,
      pars,
      match.holes,
      scoringMode,
      matchStart,
    );
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
  if (enabledKinds.includes("BBB")) {
    sgSeries.bbb = runningBbb(sgPlayers, match.holes, bbbEvents, matchStart);
  }
  if (enabledKinds.includes("SNAKE")) {
    sgSeries.snake = runningSnake(
      sgPlayers,
      match.holes,
      snakeEvents,
      matchStart,
    );
  }
  if (enabledKinds.includes("WOLF")) {
    sgSeries.wolf = runningWolf(
      seatedWolfPlayers,
      match.holes,
      wolfEvents,
      wolfConfig,
      matchStart,
    );
  }

  return (
    <div className="space-y-6">
      <AutoRefresh endpoint={`/api/matches/${match.id}/state`} />
      <WinCelebration matchId={match.id} status={match.status} />

      <header>
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate flex-1 min-w-0">
            {match.courseName}
          </h1>
          <StatusBadge status={match.status} />
          <ShareButton
            url={`/matches/${match.id}`}
            title={`${match.courseName} on Sticks`}
            label="Share"
          />
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
          {match.holes}H{matchStart === 10 ? " (back)" : ""} · par {odds.meta.coursePar}
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

      {/* On-course launcher hoisted above the tabs as a primary CTA
          during a live round so it never gets buried behind a tab.
          Pre-round (UPCOMING) the on-course button is suppressed --
          GPS distances make no sense yet -- but the preview entry
          stays so players can study the holes in advance. */}
      {canLogScores && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">
                {match.status === "UPCOMING" ? "Prep" : "On course"}
              </h2>
              <p className="text-[11px] text-mute mt-0.5">
                {match.status === "UPCOMING"
                  ? "Walk the course before the round. Distances from each tee."
                  : "GPS distances to the green + one-tap score entry. Mobile-first."}
              </p>
            </div>
            {(() => {
              const mappedCount = Object.values(holeGeoByHole).filter(
                (h) => h.greenLat != null,
              ).length;
              return (
                <span className="text-[11px] text-mute font-mono tabular-nums">
                  {mappedCount}/{match.holes} mapped
                </span>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HoleStudyMode
              holes={match.holes}
              matchStartingHole={matchStart}
              startingHole={onCourseStartingHole}
              pars={pars}
              scoresByHole={
                myMatchPlayer
                  ? Object.fromEntries(
                      myMatchPlayer.scores.map((s) => [s.hole, s.strokes]),
                    )
                  : undefined
              }
              holeGeoByHole={holeGeoByHole}
              hazardsByHole={hazardsByHole}
              wind={
                wind
                  ? { speedMph: wind.speedMph, fromDeg: wind.fromDeg }
                  : null
              }
            />
            {match.status !== "UPCOMING" && (
              <OnCourseMode
                matchId={match.id}
                courseName={match.courseName}
                holes={match.holes}
                matchStartingHole={matchStart}
                startingHole={onCourseStartingHole}
                pars={pars}
                scoresByHole={
                  myMatchPlayer
                    ? Object.fromEntries(
                        myMatchPlayer.scores.map((s) => [s.hole, s.strokes]),
                      )
                    : undefined
                }
                holeGeoByHole={holeGeoByHole}
                hazardsByHole={hazardsByHole}
                myMatchPlayerId={myMatchPlayer?.id ?? null}
                wind={
                  wind
                    ? { speedMph: wind.speedMph, fromDeg: wind.fromDeg }
                    : null
                }
              />
            )}
          </div>
        </section>
      )}

      <MatchTabs
        defaultTabId="scorecard"
        tabs={buildMatchTabs({
          match,
          user,
          isCreator,
          isCompleted,
          canLogScores,
          matchStart,
          pars,
          playerMeta,
          displayEntities,
          odds,
          modeLabel: strokeFieldLabel,
          projLabel,
          series,
          oddsHoleSeries,
          oddsXMode,
          sgSeries,
          sideGameSections,
          sideGameLabel,
          enabledKinds,
          myWager,
          bbbGame,
          bbbEvents,
          snakeGame,
          snakeEvents,
          wolfGame,
          wolfEvents,
          wolfConfig,
          seatedWolfPlayers,
          placeWagerAction,
          updateHandicapAction,
          updateParsAction,
          saveCourseParsAction,
        })}
      />
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


// Builds the tab list for the match detail page. Each tab's `content`
// is JSX that gets mounted eagerly by MatchTabs (display:none on the
// inactive ones) so tab switches stay instant and form state isn't
// re-mounted on every click.
//
// The argument bag is verbose on purpose: the page is a server
// component that already computes a lot of state, and threading those
// pre-computed values in keeps this helper a pure function of the
// match snapshot.
type BuildMatchTabsArgs = {
  match: {
    id: string;
    courseName: string;
    holes: number;
    players: Array<{ id: string; displayName: string; seat: number }>;
    wagers: Array<{
      id: string;
      user: { username: string };
      pickedPlayer: { displayName: string };
    }>;
  };
  user: { id: string } | null;
  isCreator: boolean;
  isCompleted: boolean;
  canLogScores: boolean;
  matchStart: number;
  pars: number[];
  playerMeta: Array<{
    id: string;
    displayName: string;
    color: string;
    handicap: number;
    wagerCount: number;
    probability: number;
    netScore: number | null;
    scores: Array<{ hole: number; strokes: number }>;
    seat: number;
  }>;
  // Same shape as playerMeta but collapsed to 2 team rows in
  // SCRAMBLE matches. Equal to playerMeta in INDIVIDUAL matches.
  displayEntities: Array<{
    id: string;
    displayName: string;
    color: string;
    handicap: number;
    wagerCount: number;
    probability: number;
    netScore: number | null;
    scores: Array<{ hole: number; strokes: number }>;
    seat: number;
  }>;
  odds: {
    weights: { model: number; crowd: number; live: number };
    meta: { holesPlayed: number; coursePar: number; totalWagers: number };
  };
  modeLabel: string;
  projLabel: string;
  series: ({ t: number } & Record<string, number>)[];
  oddsHoleSeries: ({ hole: number } & Record<string, number>)[] | null;
  oddsXMode: "time" | "hole";
  sgSeries: SideGameSeries;
  sideGameSections: Array<{
    kind: SideGameKind;
    leaderboards: Array<{
      key: string;
      title: string;
      subtitle?: string;
      rows: Array<{
        playerId: string;
        player: string;
        value: string;
        isLeader: boolean;
      }>;
    }>;
  }>;
  sideGameLabel: Record<SideGameKind, string>;
  enabledKinds: SideGameKind[];
  myWager: { pickedPlayerId: string } | null;
  bbbGame: { id: string } | null | undefined;
  bbbEvents: BbbEvent[];
  snakeGame: { id: string } | null | undefined;
  snakeEvents: SnakeEvent[];
  wolfGame: { id: string } | null | undefined;
  wolfEvents: WolfEvent[];
  wolfConfig: { rotation?: string[]; pushRule?: "NO_POINTS" | "ROLLOVER" };
  seatedWolfPlayers: Array<{
    id: string;
    seat: number;
    displayName: string;
    handicap: number;
    scoresByHole: Record<number, number>;
  }>;
  placeWagerAction: (fd: FormData) => Promise<void>;
  updateHandicapAction: (fd: FormData) => Promise<void>;
  updateParsAction: (fd: FormData) => Promise<void>;
  saveCourseParsAction: (fd: FormData) => Promise<void>;
};

function buildMatchTabs(a: BuildMatchTabsArgs): MatchTab[] {
  const {
    match,
    user,
    isCreator,
    isCompleted,
    canLogScores,
    matchStart,
    pars,
    playerMeta,
    displayEntities,
    odds,
    modeLabel,
    projLabel,
    series,
    oddsHoleSeries,
    oddsXMode,
    sgSeries,
    sideGameSections,
    sideGameLabel,
    enabledKinds,
    myWager,
    bbbGame,
    bbbEvents,
    snakeGame,
    snakeEvents,
    wolfGame,
    wolfEvents,
    wolfConfig,
    seatedWolfPlayers,
    placeWagerAction,
    updateHandicapAction,
    updateParsAction,
    saveCourseParsAction,
  } = a;

  // Defined before scorecardContent so the latter can append the
  // creator-only settings panels below the score sheet.
  const settingsContent = (
    <div className="space-y-6">
      {wolfGame && user && isCreator && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-base font-semibold text-ink">
              Wolf · settings
            </h2>
            <span className="text-[11px] text-mute">
              Creator only
            </span>
          </div>
          <WolfSettings
            sideGameId={wolfGame.id}
            players={match.players.map((p) => ({
              id: p.id,
              displayName: p.displayName,
              seat: p.seat,
            }))}
            rotation={wolfConfig.rotation ?? []}
            pushRule={wolfConfig.pushRule ?? "NO_POINTS"}
            locked={isCompleted}
          />
        </section>
      )}
      {isCreator && (
        <section className="card p-4">
          <ParsEditor
            action={updateParsAction}
            saveCourseAction={saveCourseParsAction}
            matchId={match.id}
            holes={match.holes}
            startingHole={matchStart}
            pars={pars}
          />
        </section>
      )}
    </div>
  );

  const scorecardContent = (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold text-ink">
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
          <>
            {!canLogScores && !isCompleted && (
              <div className="text-xs text-mute mb-3">
                Read-only — only the creator and players in this match can log
                scores.
              </div>
            )}
            <Scorecard
              matchId={match.id}
              holes={match.holes}
              startingHole={matchStart}
              pars={pars}
              players={displayEntities}
              locked={!canLogScores}
            />
          </>
        )}
      </section>
      {/* Creator-only configuration lives here instead of its own tab --
          pars + Wolf rotation are tied directly to scoring, so they
          read naturally as a continuation of the scorecard. */}
      {isCreator && settingsContent}
    </div>
  );

  const marketContent = (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-display text-base font-semibold text-ink">
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
          oddsHoleSeries={oddsHoleSeries}
          oddsXMode={oddsXMode}
          players={displayEntities.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            color: p.color,
          }))}
          sideGames={sgSeries}
        />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {displayEntities.map((p) => (
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
                      {modeLabel} {p.handicap}
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
        <h2 className="font-display text-base font-semibold text-ink mb-3">
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
            players={displayEntities}
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
    </div>
  );

  const hasSideGames =
    !!bbbGame || !!snakeGame || !!wolfGame || sideGameSections.length > 0;

  const sideGamesContent = (
    <div className="space-y-6">
      {bbbGame && user && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-base font-semibold text-ink">
              Bingo Bango Bongo · events
            </h2>
            <span className="text-[11px] text-mute">
              Tap a cell to assign the point
            </span>
          </div>
          <BBBEditor
            sideGameId={bbbGame.id}
            holes={match.holes}
            startingHole={matchStart}
            players={match.players.map((p) => ({
              id: p.id,
              displayName: p.displayName,
            }))}
            events={(() => {
              const out: Record<
                number,
                Partial<Record<"BINGO" | "BANGO" | "BONGO", string | null>>
              > = {};
              for (const e of bbbEvents) {
                if (!out[e.hole]) out[e.hole] = {};
                out[e.hole]![e.kind] = e.matchPlayerId;
              }
              return out;
            })()}
            locked={!canLogScores}
          />
        </section>
      )}

      {snakeGame && user && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-base font-semibold text-ink">
              Snake · 3-putts
            </h2>
            <span className="text-[11px] text-mute">
              Tap a name to toggle a 3-putt on that hole
            </span>
          </div>
          <SnakeEditor
            sideGameId={snakeGame.id}
            holes={match.holes}
            startingHole={matchStart}
            players={match.players.map((p) => ({
              id: p.id,
              displayName: p.displayName,
            }))}
            threePuttsByHole={(() => {
              const out: Record<number, Set<string>> = {};
              for (const e of snakeEvents) {
                if (!out[e.hole]) out[e.hole] = new Set();
                out[e.hole].add(e.matchPlayerId);
              }
              return out;
            })()}
            locked={!canLogScores}
          />
        </section>
      )}

      {wolfGame && user && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-base font-semibold text-ink">
              Wolf · partners &amp; winners
            </h2>
            <span className="text-[11px] text-mute">
              {wolfConfig.rotation && wolfConfig.rotation.length > 0
                ? "Custom rotation"
                : "Wolf rotates by seat each hole"}
            </span>
          </div>
          <WolfEditor
            sideGameId={wolfGame.id}
            holes={match.holes}
            startingHole={matchStart}
            players={match.players.map((p) => ({
              id: p.id,
              displayName: p.displayName,
              seat: p.seat,
            }))}
            rotation={wolfConfig.rotation ?? []}
            byHole={(() => {
              const shaped = shapeWolfHoles(
                seatedWolfPlayers,
                match.holes,
                wolfEvents,
                wolfConfig.rotation,
                matchStart,
              );
              return Object.fromEntries(
                shaped.map((s) => [
                  s.hole,
                  {
                    hole: s.hole,
                    partnerId: s.partnerId,
                    isLoneWolf: s.isLoneWolf,
                    isPreLoneWolf: s.isPreLoneWolf,
                    winnerId: s.winnerId,
                    isPush: s.isPush,
                  },
                ]),
              );
            })()}
            locked={!canLogScores}
          />
        </section>
      )}

      {sideGameSections.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-base font-semibold text-ink mb-3">
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
    </div>
  );

  const tabs: MatchTab[] = [
    {
      id: "scorecard",
      label: "Scorecard",
      badge: `${odds.meta.holesPlayed}/${match.holes}`,
      content: scorecardContent,
    },
    {
      id: "market",
      label: "Market",
      badge: odds.meta.totalWagers > 0 ? odds.meta.totalWagers : null,
      content: marketContent,
    },
  ];
  if (hasSideGames) {
    tabs.push({
      id: "side-games",
      label: "Side games",
      badge: enabledKinds.length || null,
      content: sideGamesContent,
    });
  }
  return tabs;
}
