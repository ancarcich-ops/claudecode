// Scramble format helpers.
//
// In a scramble each team has ONE score per hole (the team plays the
// best ball from each shot and keeps walking the chosen ball forward
// until it's holed out). For Sticks v1 a scramble match is always 2
// teams; team membership is recorded on MatchPlayer.team (0 or 1).
//
// Score storage convention: scores are written against the team's
// "captain", defined here as the lowest-seat member of each team.
// The other teammates have no ScoreEntry rows. On the read side
// `captainForTeam` is the single source of truth so callers don't
// need to know about the convention.

export type ScrambleHandicapMode =
  | "GROSS" // Team plays scratch -- no allowance.
  | "AVG" // Team allowance = mean of teammate handicaps.
  | "CUSTOM"; // Group decides each team's allowance manually.

export type ScrambleConfig = {
  handicapMode: ScrambleHandicapMode;
  // Display names override the default "Team A" / "Team B". Optional.
  teamNames?: { 0?: string; 1?: string };
  // Per-team custom allowance, only honoured when handicapMode is
  // "CUSTOM". Missing entries fall back to 0.
  customAllowance?: { 0?: number; 1?: number };
};

const HANDICAP_MODES: ScrambleHandicapMode[] = ["GROSS", "AVG", "CUSTOM"];

export function parseScrambleConfig(raw: string | null | undefined): ScrambleConfig {
  if (!raw) return { handicapMode: "GROSS" };
  try {
    const obj = JSON.parse(raw) as Partial<ScrambleConfig> | null;
    if (!obj || typeof obj !== "object") return { handicapMode: "GROSS" };
    const mode: ScrambleHandicapMode = HANDICAP_MODES.includes(
      obj.handicapMode as ScrambleHandicapMode,
    )
      ? (obj.handicapMode as ScrambleHandicapMode)
      : "GROSS";
    const teamNames =
      obj.teamNames && typeof obj.teamNames === "object"
        ? {
            0:
              typeof obj.teamNames[0] === "string" && obj.teamNames[0].length > 0
                ? obj.teamNames[0]
                : undefined,
            1:
              typeof obj.teamNames[1] === "string" && obj.teamNames[1].length > 0
                ? obj.teamNames[1]
                : undefined,
          }
        : undefined;
    const customAllowance =
      obj.customAllowance && typeof obj.customAllowance === "object"
        ? {
            0:
              typeof obj.customAllowance[0] === "number" &&
              Number.isFinite(obj.customAllowance[0])
                ? obj.customAllowance[0]
                : undefined,
            1:
              typeof obj.customAllowance[1] === "number" &&
              Number.isFinite(obj.customAllowance[1])
                ? obj.customAllowance[1]
                : undefined,
          }
        : undefined;
    return { handicapMode: mode, teamNames, customAllowance };
  } catch {
    return { handicapMode: "GROSS" };
  }
}

export function teamLabel(
  team: 0 | 1,
  config: ScrambleConfig | null,
): string {
  const fromConfig = config?.teamNames?.[team];
  if (fromConfig && fromConfig.trim()) return fromConfig.trim();
  return team === 0 ? "Team A" : "Team B";
}

type Player = {
  id: string;
  displayName: string;
  handicap: number;
  seat: number;
  team: number | null;
};

// Split a player list into the two teams. Players whose team is null
// (e.g. a malformed scramble match where someone wasn't assigned) are
// dropped from the team partition -- the caller decides whether to
// surface that as an error or just ignore the unassigned player.
export function partitionTeams<P extends Player>(
  players: P[],
): { 0: P[]; 1: P[] } {
  const a: P[] = [];
  const b: P[] = [];
  for (const p of players) {
    if (p.team === 0) a.push(p);
    else if (p.team === 1) b.push(p);
  }
  a.sort((x, y) => x.seat - y.seat);
  b.sort((x, y) => x.seat - y.seat);
  return { 0: a, 1: b };
}

// Captain = lowest-seat player on the team. Scores live on this row.
export function captainForTeam<P extends Player>(team: P[]): P | null {
  if (team.length === 0) return null;
  return team.reduce((best, cur) => (cur.seat < best.seat ? cur : best));
}

// Per-team handicap allowance. Always returned as a non-negative
// number; modes that would produce 0 (GROSS) return 0. AVG rounds
// to one decimal so scorecards don't show 4-place noise. CUSTOM
// reads the user-typed allowance from scrambleConfig (passed via
// the `custom` arg when called from the match-loading path).
export function teamHandicap<P extends Player>(
  team: P[],
  mode: ScrambleHandicapMode,
  customAllowance?: number,
): number {
  if (team.length === 0) return 0;
  if (mode === "GROSS") return 0;
  if (mode === "CUSTOM") {
    if (typeof customAllowance !== "number" || !Number.isFinite(customAllowance)) {
      return 0;
    }
    return Math.max(0, customAllowance);
  }
  // mode === "AVG"
  const hcps = team.map((p) => p.handicap);
  const avg = hcps.reduce((a, b) => a + b, 0) / hcps.length;
  return Math.round(avg * 10) / 10;
}

// Derive a team's per-hole gross scores from each teammate's scores
// using one of the team-vs-team rules. Used by the SCRAMBLE odds path
// when feeding the engine its team-level scoresByHole -- with per-
// player entry, the captain-only-logs-team-score model is dropped
// and team scores are computed via the rule (Best ball / Worst ball /
// High + low / Sum / Aggregate net). Returns a hole -> stroke total
// map; holes missing any teammate's entry are omitted.
//
// Rule string is intentionally typed loosely (string | undefined) so
// callers can pass values straight off persisted side-game config
// without an extra cast; unknown rules fall back to BEST_BALL.
type RuleId =
  | "BEST_BALL"
  | "WORST_BALL"
  | "HIGH_LOW"
  | "HIGH_LOW_BALL"
  | "SUM"
  | "AGGREGATE_NET";

export function deriveTeamScoresByHole<
  P extends Player & {
    scores: { hole: number; strokes: number }[];
  },
>(
  team: P[],
  rule: string | undefined,
  pars: number[],
  totalHoles: number,
  startingHole = 1,
): Record<number, number> {
  if (team.length === 0) return {};
  const r: RuleId = (
    [
      "BEST_BALL",
      "WORST_BALL",
      "HIGH_LOW",
      "HIGH_LOW_BALL",
      "SUM",
      "AGGREGATE_NET",
    ] as const
  ).includes(rule as RuleId)
    ? (rule as RuleId)
    : "BEST_BALL";

  // Per-player score lookup by hole. AGGREGATE_NET also needs the
  // per-player handicap-adjusted stroke -- computed inline so we don't
  // pull in netStrokesForHole from sideGames.ts (avoids circular dep).
  const scoreFor = (p: P, holeIndex0: number): number | null => {
    const hole = startingHole + holeIndex0;
    const entry = p.scores.find((s) => s.hole === hole);
    if (!entry) return null;
    if (r !== "AGGREGATE_NET") return entry.strokes;
    // Net = gross - strokes-given on this hole. Strokes spread evenly
    // by hole number: floor(hcp/holes) on each, +1 on the first
    // (hcp % holes) holes. Same shape as src/lib/sideGames.ts's
    // strokesGiven helper.
    if (p.handicap <= 0) return entry.strokes;
    const base = Math.floor(p.handicap / totalHoles);
    const extra = p.handicap - base * totalHoles;
    const strokes = base + (holeIndex0 < extra ? 1 : 0);
    return entry.strokes - strokes;
  };

  const out: Record<number, number> = {};
  for (let i = 0; i < totalHoles; i++) {
    const hole = startingHole + i;
    const vals: number[] = [];
    let anyMissing = false;
    for (const p of team) {
      const v = scoreFor(p, i);
      if (v == null) {
        anyMissing = true;
        break;
      }
      vals.push(v);
    }
    if (anyMissing || vals.length === 0) continue;
    let teamScore: number;
    switch (r) {
      case "BEST_BALL":
        teamScore = Math.min(...vals);
        break;
      case "WORST_BALL":
        teamScore = Math.max(...vals);
        break;
      case "HIGH_LOW":
      case "HIGH_LOW_BALL":
        // Both rules are points games (see computeTeamVsTeam in
        // sideGames.ts) -- the odds engine can't price points
        // directly. Fall back to team gross sum so live odds still
        // track who's outscoring whom; tends to correlate with the
        // points leaderboard since the team with more low-strokes
        // wins more head-to-heads. Leaderboard remains points-accurate.
        teamScore = vals.reduce((a, b) => a + b, 0);
        break;
      case "SUM":
      case "AGGREGATE_NET":
        teamScore = vals.reduce((a, b) => a + b, 0);
        break;
    }
    // pars[] is read by the caller for downstream display; we don't
    // need it here but accept it to mirror the side-game compute
    // signature for symmetry.
    void pars;
    out[hole] = teamScore;
  }
  return out;
}
