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
