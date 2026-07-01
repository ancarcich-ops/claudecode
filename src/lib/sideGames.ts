// Side-game compute engine. Pure functions: each `compute*` takes already-
// loaded scores + pars + handicaps and returns one or more leaderboards.
//
// Phase 1 supports games derivable from per-hole strokes alone:
//   - Stableford (WHS standard points)
//   - Skins (with carryover)
//   - Nassau (front 9 / back 9 / total, 18-hole rounds only)
//
// Wolf, Bingo Bango Bongo, and Snake need per-hole event data we don't
// capture yet (partner rotation, on-green / closest-pin events, 3-putts).
// Those land in phase 2 once we add a per-hole event recorder.

export type SideGameKind =
  | "STABLEFORD"
  | "SKINS"
  | "NASSAU"
  | "BBB"
  | "SNAKE"
  | "WOLF"
  | "TEAM_VS_TEAM"
  | "MATCH"
  | "SIXES"
  | "TARGETS";

// Per-hole event kinds. Stored in SideGameEvent.kind for BBB rows.
export const BBB_EVENT_KINDS = ["BINGO", "BANGO", "BONGO"] as const;
export type BbbEventKind = (typeof BBB_EVENT_KINDS)[number];

export function isBbbEventKind(s: string): s is BbbEventKind {
  return (BBB_EVENT_KINDS as readonly string[]).includes(s);
}

export const SNAKE_EVENT_KINDS = ["THREE_PUTT"] as const;
export type SnakeEventKind = (typeof SNAKE_EVENT_KINDS)[number];

export function isSnakeEventKind(s: string): s is SnakeEventKind {
  return (SNAKE_EVENT_KINDS as readonly string[]).includes(s);
}

// Match-play press events. Each event marks a manual press called at
// a specific hole; the press takes effect from hole+1 onwards. 2-player
// matches only -- compute ignores press events on 3+ player matches.
export const MATCH_EVENT_KINDS = ["PRESS"] as const;
export type MatchEventKind = (typeof MATCH_EVENT_KINDS)[number];

export function isMatchEventKind(s: string): s is MatchEventKind {
  return (MATCH_EVENT_KINDS as readonly string[]).includes(s);
}

export type MatchEvent = {
  hole: number;
  kind: MatchEventKind;
};

export const WOLF_EVENT_KINDS = [
  "PARTNER",
  "LONE_WOLF",
  "PRE_LONE_WOLF",
  "HOLE_WINNER",
  "PUSH",
] as const;
export type WolfEventKind = (typeof WOLF_EVENT_KINDS)[number];

export function isWolfEventKind(s: string): s is WolfEventKind {
  return (WOLF_EVENT_KINDS as readonly string[]).includes(s);
}

// Per-match Wolf configuration. Stored as JSON on SideGame.config when
// the creator deviates from defaults; absent means use defaults.
//   rotation: optional list of matchPlayerId in turn order. Wolf for hole
//             N is rotation[(N-1) % rotation.length]. Defaults to seat
//             order.
//   pushRule: how pushed holes (HOLE_WINNER missing, PUSH recorded) score.
//             - NO_POINTS (default): pushed hole awards nothing, move on.
//             - ROLLOVER: a push increments a carry counter; the next
//               resolved hole's points are multiplied by (1 + carry).
export type WolfPushRule = "NO_POINTS" | "ROLLOVER";
export type WolfConfig = {
  rotation?: string[];
  pushRule?: WolfPushRule;
};

export function parseWolfConfig(s: string | null | undefined): WolfConfig {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    if (typeof v !== "object" || v === null) return {};
    const out: WolfConfig = {};
    if (Array.isArray(v.rotation) && v.rotation.every((x: unknown) => typeof x === "string")) {
      out.rotation = v.rotation;
    }
    if (v.pushRule === "ROLLOVER" || v.pushRule === "NO_POINTS") {
      out.pushRule = v.pushRule;
    }
    return out;
  } catch {
    return {};
  }
}

export function stringifyWolfConfig(c: WolfConfig): string {
  return JSON.stringify(c);
}

// Per-match Skins configuration. Default behavior (no config row) is
// CARRYOVER: a tied hole increments the carry counter, the next
// resolved hole pays out 1 + carry skins to its winner. NO_CARRY
// flips that to "tied hole = nobody scores, next hole starts fresh
// at 1 skin" -- common house rule when you want a clean pot per
// hole instead of betting that the carry pays out.
export type SkinsPushRule = "CARRYOVER" | "NO_CARRY";
export type SkinsConfig = {
  pushRule?: SkinsPushRule;
};

export function parseSkinsConfig(s: string | null | undefined): SkinsConfig {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    if (typeof v !== "object" || v === null) return {};
    const out: SkinsConfig = {};
    if (v.pushRule === "CARRYOVER" || v.pushRule === "NO_CARRY") {
      out.pushRule = v.pushRule;
    }
    return out;
  } catch {
    return {};
  }
}

export function stringifySkinsConfig(c: SkinsConfig): string {
  return JSON.stringify(c);
}

// ---- Team-vs-Team side game --------------------------------------------
// Runs on top of any match (INDIVIDUAL or SCRAMBLE). Splits players into
// 2 teams (assignment stored in TeamVsTeamConfig.teams as arrays of
// matchPlayerIds) and computes a per-hole team score using one of five
// configurable rules.

export type TeamVsTeamRule =
  // Lowest single player score on each team -- match-play "best ball".
  | "BEST_BALL"
  // Highest single player score on each team -- "worst ball" / nasty.
  | "WORST_BALL"
  // 2 pts/hole: 1 for the lowest individual on the hole, 1 for the
  // lower team sum; cross-team ties push.
  | "HIGH_LOW"
  // 2 pts/hole: low-ball vs low-ball + high-ball vs high-ball,
  // lowest of each pair wins; ties push.
  | "HIGH_LOW_BALL"
  // Sum of all team players' gross strokes.
  | "SUM"
  // Sum of all team players' net (handicap-adjusted) strokes.
  | "AGGREGATE_NET"
  // Vegas: each team's two scores form a 2-digit number (low digit
  // first). Lower team wins the difference in points. 2v2 only.
  | "VEGAS";

export const TEAM_VS_TEAM_RULES: TeamVsTeamRule[] = [
  "BEST_BALL",
  "WORST_BALL",
  "HIGH_LOW",
  "HIGH_LOW_BALL",
  "SUM",
  "AGGREGATE_NET",
  "VEGAS",
];

export type VegasDoubleHoles = "OFF" | "INCREMENTAL" | "EXPONENTIAL";
export type VegasOptions = {
  // Birdie flip: when a team birdies the hole, the OTHER team's
  // 2-digit Vegas score flips (high digit becomes the tens place).
  birdieFlip?: boolean;
  // Tied-hole multiplier carry. OFF (default) = ties contribute 0 and
  // play continues at 1x. INCREMENTAL = next hole 2x, then 3x, 4x...
  // EXPONENTIAL = 2x, 4x, 8x... Multiplier resets to 1x on any non-tied
  // hole.
  doubleHoles?: VegasDoubleHoles;
  // Optional dollar wager per Vegas point. When > 0, the team rows
  // append a $ amount and the subtitle notes the per-point stake.
  stake?: number;
};

export type TeamVsTeamRuleConfig = {
  rule: TeamVsTeamRule;
  // Optional dollar wager. Per-rule so a group can run Best Ball at
  // $5/dot and Vegas at $0.25/point on the same round.
  stake?: number;
  // Vegas-only options. Ignored when rule !== "VEGAS".
  vegas?: VegasOptions;
};

export type TeamVsTeamConfig = {
  // matchPlayerId arrays per team. Stored as { "0": [...], "1": [...] }
  // in JSON; parsed back into a typed object here.
  teams: { 0: string[]; 1: string[] };
  // One or more team rules running simultaneously. Each rule generates
  // its own leaderboard panel.
  rules: TeamVsTeamRuleConfig[];
  // Optional display names; falls back to "Team A" / "Team B".
  teamNames?: { 0?: string; 1?: string };
};

function isTeamVsTeamRule(s: unknown): s is TeamVsTeamRule {
  return (
    typeof s === "string" &&
    (TEAM_VS_TEAM_RULES as readonly string[]).includes(s)
  );
}

export function parseTeamVsTeamConfig(
  raw: string | null | undefined,
): TeamVsTeamConfig | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const teams = obj.teams;
    if (
      !teams ||
      !Array.isArray(teams[0]) ||
      !Array.isArray(teams[1]) ||
      teams[0].some((x: unknown) => typeof x !== "string") ||
      teams[1].some((x: unknown) => typeof x !== "string")
    ) {
      return null;
    }
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
    const parseVegas = (v: unknown): VegasOptions | undefined => {
      if (!v || typeof v !== "object") return undefined;
      const obj = v as Record<string, unknown>;
      return {
        birdieFlip: obj.birdieFlip === true,
        doubleHoles:
          obj.doubleHoles === "INCREMENTAL" || obj.doubleHoles === "EXPONENTIAL"
            ? (obj.doubleHoles as VegasDoubleHoles)
            : "OFF",
      };
    };
    const parseStake = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;

    // New shape: { rules: [{ rule, stake?, vegas? }, ...] }.
    // Legacy shape (pre-multi-rule): { rule, vegas?, vegas.stake? } -- the
    // old single-rule config tucked the per-Vegas stake inside the vegas
    // sub-object. Both shapes parse here so existing matches keep working.
    let rules: TeamVsTeamRuleConfig[] = [];
    if (Array.isArray(obj.rules)) {
      for (const r of obj.rules as unknown[]) {
        if (!r || typeof r !== "object") continue;
        const rec = r as Record<string, unknown>;
        if (!isTeamVsTeamRule(rec.rule)) continue;
        rules.push({
          rule: rec.rule,
          stake: parseStake(rec.stake),
          vegas: rec.rule === "VEGAS" ? parseVegas(rec.vegas) : undefined,
        });
      }
    } else if (isTeamVsTeamRule(obj.rule)) {
      // Legacy single-rule shape. Vegas stake was nested under
      // vegas.stake in that shape; migrate it up.
      const legacyVegas =
        obj.vegas && typeof obj.vegas === "object"
          ? (obj.vegas as Record<string, unknown>)
          : null;
      rules = [
        {
          rule: obj.rule as TeamVsTeamRule,
          stake:
            obj.rule === "VEGAS" && legacyVegas
              ? parseStake(legacyVegas.stake)
              : undefined,
          vegas: obj.rule === "VEGAS" ? parseVegas(obj.vegas) : undefined,
        },
      ];
    }
    if (rules.length === 0) rules.push({ rule: "BEST_BALL" });
    return { teams: { 0: teams[0], 1: teams[1] }, rules, teamNames };
  } catch {
    return null;
  }
}

export function stringifyTeamVsTeamConfig(c: TeamVsTeamConfig): string {
  return JSON.stringify(c);
}

// ---- Match config ------------------------------------------------------
// Match-play stroke-giving. AUTO uses the match-level scoringMode +
// per-player handicaps (the default). MANUAL lets the user override
// the effective strokes per player for Match specifically -- handy
// when the group wants to play scratch elsewhere but level Match.

export type MatchStrokesMode = "AUTO" | "MANUAL";
export type MatchConfig = {
  strokesMode: MatchStrokesMode;
  // matchPlayerId -> total strokes used as the effective handicap for
  // the Match leaderboard. Honored only when strokesMode === "MANUAL".
  manualStrokes?: Record<string, number>;
  // Auto-press: in a 2-player match, whenever the running differential
  // hits abs(threshold) a fresh "press" line is started from the next
  // hole. All lines accrue independently; the leaderboard shows the
  // sum across all lines.
  autoPress?: boolean;
  autoPressThreshold?: number; // default 2 when autoPress is on
  // Optional dollar wager per dot. When > 0, the leaderboard appends
  // $X per player based on their final dot total × stake.
  stake?: number;
};

export function parseMatchConfig(
  raw: string | null | undefined,
): MatchConfig | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const strokesMode: MatchStrokesMode =
      obj.strokesMode === "MANUAL" ? "MANUAL" : "AUTO";
    const manualStrokes: Record<string, number> = {};
    if (obj.manualStrokes && typeof obj.manualStrokes === "object") {
      for (const [k, v] of Object.entries(obj.manualStrokes)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          manualStrokes[k] = Math.max(0, Math.floor(v));
        }
      }
    }
    const autoPress = obj.autoPress === true;
    const rawThreshold = Number(obj.autoPressThreshold);
    const autoPressThreshold =
      autoPress && Number.isFinite(rawThreshold) && rawThreshold >= 1
        ? Math.floor(rawThreshold)
        : undefined;
    const stake =
      typeof obj.stake === "number" && Number.isFinite(obj.stake) && obj.stake > 0
        ? obj.stake
        : undefined;
    return { strokesMode, manualStrokes, autoPress, autoPressThreshold, stake };
  } catch {
    return null;
  }
}

export function stringifyMatchConfig(c: MatchConfig): string {
  return JSON.stringify(c);
}

// ---- Sixes config ------------------------------------------------------
// Sixes shares match-play scoring shape with Match, so the only knob
// for v1 is a dollar wager per dot. Strokes follow the match-level
// scoringMode + per-player handicap as before.
export type SixesConfig = {
  stake?: number;
};

export function parseSixesConfig(
  raw: string | null | undefined,
): SixesConfig | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const stake =
      typeof obj.stake === "number" && Number.isFinite(obj.stake) && obj.stake > 0
        ? obj.stake
        : undefined;
    return { stake };
  } catch {
    return null;
  }
}

export function stringifySixesConfig(c: SixesConfig): string {
  return JSON.stringify(c);
}

// ---- Targets -----------------------------------------------------------
// Per-round goal counting: each player aims for a target count of a
// specific qualifying event. v1 supports stats derivable from existing
// score data; FIR/GIR will land once we add a per-hole event recorder.

export type TargetsStat = "PAR_OR_BETTER" | "BIRDIE_OR_BETTER";
const TARGETS_STATS: TargetsStat[] = ["PAR_OR_BETTER", "BIRDIE_OR_BETTER"];

export type TargetsConfig = {
  stat: TargetsStat;
  // Shared target number every player aims for. Single number for v1;
  // per-player targets can layer on later if asked.
  target: number;
  // Optional ante (per player). When > 0, the leaderboard surfaces a
  // pot and per-player payout. All-hit or no-hit refunds (each gets 0
  // net). Otherwise winners split the loser pot evenly.
  ante?: number;
};

export function targetsStatLabel(stat: TargetsStat): string {
  return stat === "PAR_OR_BETTER" ? "Pars or better" : "Birdies or better";
}

export function parseTargetsConfig(
  raw: string | null | undefined,
): TargetsConfig | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const stat: TargetsStat = TARGETS_STATS.includes(obj.stat as TargetsStat)
      ? (obj.stat as TargetsStat)
      : "PAR_OR_BETTER";
    const target =
      typeof obj.target === "number" && Number.isFinite(obj.target)
        ? Math.max(0, Math.floor(obj.target))
        : 0;
    const ante =
      typeof obj.ante === "number" && Number.isFinite(obj.ante) && obj.ante > 0
        ? obj.ante
        : undefined;
    return { stat, target, ante };
  } catch {
    return null;
  }
}

export function stringifyTargetsConfig(c: TargetsConfig): string {
  return JSON.stringify(c);
}

// Compact rule descriptions used in the side-game picker + leaderboard
// subtitle so the player understands what's being summed per hole.
export function teamVsTeamRuleLabel(rule: TeamVsTeamRule): string {
  switch (rule) {
    case "BEST_BALL":
      return "Best Ball";
    case "WORST_BALL":
      return "Worst Ball";
    case "HIGH_LOW":
      return "Low Ball, Low Total";
    case "HIGH_LOW_BALL":
      return "Low Ball / High Ball";
    case "SUM":
      return "Sum of Strokes";
    case "AGGREGATE_NET":
      return "Aggregate Net";
    case "VEGAS":
      return "Vegas";
  }
}

export function teamVsTeamRuleBlurb(rule: TeamVsTeamRule): string {
  switch (rule) {
    case "BEST_BALL":
      return "Each team's score on a hole = its lowest player's score";
    case "WORST_BALL":
      return "Each team's score on a hole = its highest player's score";
    case "HIGH_LOW":
      return "2 points per hole: 1 for the lowest individual, 1 for the lowest team sum; ties push";
    case "HIGH_LOW_BALL":
      return "Compare the two low scores (“low ball”) and the two high scores (“high ball”) against each other. The lowest of each group wins.";
    case "SUM":
      return "Each team's score = sum of all teammates' gross strokes";
    case "AGGREGATE_NET":
      return "Each team's score = sum of all teammates' net strokes";
    case "VEGAS":
      return "Each team's two scores form a 2-digit number (low first); lower team wins the difference in points.";
  }
}

export const ALL_SIDE_GAMES: {
  kind: SideGameKind;
  label: string;
  blurb: string;
  // For 9-hole matches we hide Nassau (it's defined by front/back 9).
  requires18?: boolean;
  // Sixes (rotating 2-on-2 partnerships every 6 holes) needs exactly 4
  // players. The new-match form disables the checkbox with a helpful
  // hint when the constraint isn't met.
  requires4Players?: boolean;
}[] = [
  {
    kind: "STABLEFORD",
    label: "Stableford",
    blurb: "WHS points per hole. Higher is better.",
  },
  {
    kind: "SKINS",
    label: "Skins",
    blurb: "Low net wins the hole; ties carry over.",
  },
  {
    kind: "NASSAU",
    label: "Nassau",
    blurb: "Three bets in one: front 9, back 9, and total.",
    requires18: true,
  },
  {
    kind: "BBB",
    label: "Bingo Bango Bongo",
    blurb:
      "Three per-hole points: first on the green, closest once on, first in the hole.",
  },
  {
    kind: "SNAKE",
    label: "Snake",
    blurb:
      "Every 3-putt passes the snake. Whoever holds it at the end loses.",
  },
  {
    kind: "WOLF",
    label: "Wolf",
    blurb:
      "Rotating wolf per hole picks a partner or goes solo. Win lone = +4.",
  },
  {
    kind: "TEAM_VS_TEAM",
    label: "Team vs team",
    blurb:
      "Split into 2 teams; per-hole team score from best ball, high-low, sum, or net.",
  },
  {
    kind: "MATCH",
    label: "Match",
    blurb:
      "Match play: lowest net score on a hole wins a dot; ties wash. Round-robin with 3+ players.",
  },
  {
    kind: "SIXES",
    label: "Sixes",
    blurb:
      "4-player rotating partnerships every 6 holes (1+2 vs 3+4, then 1+3 vs 2+4, then 1+4 vs 2+3). Best-ball match play.",
    requires18: true,
    requires4Players: true,
  },
  {
    kind: "TARGETS",
    label: "Targets",
    blurb:
      "Each player chases a target count of pars-or-better (or birdies). Hit the number to win.",
  },
];

// Future kinds: surfaced in the UI as 'coming soon' so users can see the
// roadmap without us implementing them yet.
export const COMING_SOON_SIDE_GAMES: { kind: string; label: string; blurb: string }[] = [];

export type LiveScorePlayer = {
  id: string;
  displayName: string;
  handicap: number;
  scoresByHole: Record<number, number>;
};

export type LeaderboardRow = {
  playerId: string;
  player: string;
  value: string;
  numeric: number;
  isLeader: boolean;
};

export type Leaderboard = {
  key: string; // unique within a match (e.g. "STABLEFORD", "NASSAU_FRONT9")
  kind: SideGameKind;
  title: string;
  subtitle?: string;
  rows: LeaderboardRow[];
};

// Handicap allocation per hole. Without a per-hole stroke-index table, we
// distribute evenly by hole number: floor(hcp / holes) on each, +1 on the
// first (hcp % holes) holes. Faithful to total strokes given even if not
// to the real stroke-index priority.
function strokesGiven(
  handicap: number,
  holeIndex0: number, // 0-based
  totalHoles: number,
): number {
  if (handicap <= 0) return 0;
  const base = Math.floor(handicap / totalHoles);
  const extra = handicap - base * totalHoles;
  return base + (holeIndex0 < extra ? 1 : 0);
}

type ScoringMode = "NET" | "GROSS" | "CUSTOM";

function netStrokesForHole(
  gross: number,
  handicap: number,
  holeIndex0: number,
  totalHoles: number,
  scoringMode: ScoringMode,
): number {
  if (scoringMode === "GROSS") return gross;
  return gross - strokesGiven(handicap, holeIndex0, totalHoles);
}

function stablefordPointsFromNet(net: number, par: number): number {
  // WHS standard, capped at 0 for double-or-worse.
  const diff = net - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function rankRows(
  rows: Omit<LeaderboardRow, "isLeader">[],
  higherIsBetter: boolean,
): LeaderboardRow[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) =>
    higherIsBetter ? b.numeric - a.numeric : a.numeric - b.numeric,
  );
  const top = sorted[0].numeric;
  return sorted.map((r) => ({ ...r, isLeader: r.numeric === top }));
}

// --- Stableford ---
export function computeStableford(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
): Leaderboard {
  const rows = players.map((p) => {
    let points = 0;
    let counted = 0;
    for (let i = 0; i < holes; i++) {
      const gross = p.scoresByHole[startingHole + i];
      if (typeof gross !== "number") continue;
      const par = pars[i] ?? 4;
      const net = netStrokesForHole(gross, p.handicap, i, holes, scoringMode);
      points += stablefordPointsFromNet(net, par);
      counted++;
    }
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: points,
      value: counted === 0 ? "—" : `${points} pt${points === 1 ? "" : "s"}`,
    };
  });
  return {
    key: "STABLEFORD",
    kind: "STABLEFORD",
    title: "Stableford",
    subtitle:
      scoringMode === "GROSS" ? "Gross points" : "Net points (WHS scale)",
    rows: rankRows(rows, true),
  };
}

// --- Skins ---
export function computeSkins(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
  config?: SkinsConfig | null,
): Leaderboard {
  // Default is CARRYOVER -- preserves the long-running behavior of
  // the engine. NO_CARRY pays nothing on ties and resets each hole.
  const pushRule: SkinsPushRule = config?.pushRule ?? "CARRYOVER";
  const skinsByPlayer = new Map<string, number>();
  for (const p of players) skinsByPlayer.set(p.id, 0);

  let carryover = 1;
  let openHole = 0;

  for (let i = 0; i < holes; i++) {
    const h = startingHole + i;
    // Only resolve holes where every player has a score.
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) {
      break;
    }
    const nets = players.map((p) => ({
      id: p.id,
      net: netStrokesForHole(
        p.scoresByHole[h] as number,
        p.handicap,
        i,
        holes,
        scoringMode,
      ),
    }));
    const low = Math.min(...nets.map((n) => n.net));
    const winners = nets.filter((n) => n.net === low);
    if (winners.length === 1) {
      const id = winners[0].id;
      skinsByPlayer.set(id, (skinsByPlayer.get(id) ?? 0) + carryover);
      carryover = 1;
    } else if (pushRule === "CARRYOVER") {
      carryover += 1;
    } else {
      // NO_CARRY: pushed hole pays nothing, next hole starts fresh
      // at 1 skin instead of growing the pot.
      carryover = 1;
    }
    openHole = h;
  }

  const rows = players.map((p) => {
    const count = skinsByPlayer.get(p.id) ?? 0;
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: count,
      value: `${count} skin${count === 1 ? "" : "s"}`,
    };
  });
  const subtitle =
    openHole === 0
      ? "No holes scored yet"
      : pushRule === "CARRYOVER" && carryover > 1
        ? `Thru ${openHole} · ${carryover - 1} carrying`
        : `Thru ${openHole}`;
  return {
    key: "SKINS",
    kind: "SKINS",
    title: "Skins",
    subtitle,
    rows: rankRows(rows, true),
  };
}

// --- Match play ---------------------------------------------------------
// Per-hole net-score comparison across every unordered pair of players.
// Each fully-scored hole settles every pair: low net = +1 vs opponent,
// tied = wash. Per-player numeric = sum across all pairs and holes.
// For 2 players this is classic head-to-head match play; for 3+ players
// it's a round-robin total ("how many net-pair-points are you up?").
// Resolve the effective per-player handicap for Match scoring. AUTO
// (default) honors the match-level scoringMode + each player's handicap;
// MANUAL applies the operator-entered strokes directly and forces net
// scoring regardless of the match's scoringMode.
function matchEffective(
  config: MatchConfig | null | undefined,
  scoringMode: ScoringMode,
  playerId: string,
  handicap: number,
): { hcp: number; mode: ScoringMode } {
  if (config?.strokesMode === "MANUAL") {
    return {
      hcp: config.manualStrokes?.[playerId] ?? 0,
      mode: "NET",
    };
  }
  return { hcp: handicap, mode: scoringMode };
}

function matchPairTallies(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number,
  // Stop after this hole index (0-based, exclusive). Used by runningMatch
  // to plot the cumulative series; computeMatch passes `holes`.
  upToHoleIdx: number,
  config?: MatchConfig | null,
  events?: MatchEvent[] | null,
): {
  totals: Map<string, number>;
  thruHole: number;
  presses: number;
  manualPresses: number;
} {
  const totals = new Map<string, number>();
  for (const p of players) totals.set(p.id, 0);
  let thruHole = 0;
  // Press semantics (auto OR manual) only apply to a 2-player match.
  const isTwoPlayer = players.length === 2;
  const manualPressHoles = new Set<number>();
  if (isTwoPlayer && events) {
    for (const e of events) {
      if (e.kind === "PRESS") manualPressHoles.add(e.hole);
    }
  }
  const pressActive =
    isTwoPlayer && (!!config?.autoPress || manualPressHoles.size > 0);
  const pressThreshold = Math.max(
    1,
    Math.floor(config?.autoPressThreshold ?? 2),
  );
  // Each press line tracks (startHole, diff). diff is from p0's POV
  // (positive => p0 ahead). totals[p0] += sum(line.diff); totals[p1]
  // -= same.
  const lines: { startHole: number; diff: number; pressed: boolean }[] = [
    { startHole: 0, diff: 0, pressed: false },
  ];
  let manualPresses = 0;
  for (let i = 0; i < upToHoleIdx; i++) {
    const h = startingHole + i;
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) break;
    const nets = players.map((p) => {
      const eff = matchEffective(config, scoringMode, p.id, p.handicap);
      return {
        id: p.id,
        net: netStrokesForHole(
          p.scoresByHole[h] as number,
          eff.hcp,
          i,
          holes,
          eff.mode,
        ),
      };
    });
    if (pressActive) {
      // Update every active line (line.startHole <= i).
      let delta = 0;
      if (nets[0].net < nets[1].net) delta = 1;
      else if (nets[1].net < nets[0].net) delta = -1;
      for (const line of lines) {
        if (line.startHole > i) continue;
        line.diff += delta;
      }
      // Auto-press: spawn a new line when the most-recent un-pressed
      // line has crossed the configured threshold this hole.
      if (config?.autoPress) {
        const trigger = lines
          .filter((l) => !l.pressed && Math.abs(l.diff) >= pressThreshold)
          .pop();
        if (trigger && i + 1 < holes) {
          trigger.pressed = true;
          lines.push({ startHole: i + 1, diff: 0, pressed: false });
        }
      }
      // Manual press: a recorded event at hole h spawns a line starting
      // at hole+1. Marks the most-recent un-pressed line as pressed too
      // so the press count is consistent.
      if (manualPressHoles.has(h) && i + 1 < holes) {
        const target = [...lines].reverse().find((l) => !l.pressed);
        if (target) target.pressed = true;
        lines.push({ startHole: i + 1, diff: 0, pressed: false });
        manualPresses++;
      }
    } else {
      // Standard round-robin pair tally for 2+ players, no press.
      for (let a = 0; a < nets.length; a++) {
        for (let b = a + 1; b < nets.length; b++) {
          if (nets[a].net < nets[b].net) {
            totals.set(nets[a].id, (totals.get(nets[a].id) ?? 0) + 1);
            totals.set(nets[b].id, (totals.get(nets[b].id) ?? 0) - 1);
          } else if (nets[b].net < nets[a].net) {
            totals.set(nets[b].id, (totals.get(nets[b].id) ?? 0) + 1);
            totals.set(nets[a].id, (totals.get(nets[a].id) ?? 0) - 1);
          }
        }
      }
    }
    thruHole = h;
  }
  if (pressActive) {
    const sum = lines.reduce((a, l) => a + l.diff, 0);
    totals.set(players[0].id, sum);
    totals.set(players[1].id, -sum);
  }
  return {
    totals,
    thruHole,
    presses: pressActive ? lines.length - 1 : 0,
    manualPresses,
  };
}

function formatMatchPoints(n: number): string {
  if (n === 0) return "AS";
  return n > 0 ? `+${n}` : `${n}`;
}

// Compact money formatter -- whole dollars when round, one decimal
// otherwise; uses a U+2212 minus for negatives so leaderboard cells
// stay visually consistent across browsers.
function fmtMoney(n: number): string {
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  const txt = Number.isInteger(v) ? `${v}` : v.toFixed(1);
  return `${sign}$${txt}`;
}

export function computeMatch(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
  config?: MatchConfig | null,
  events?: MatchEvent[] | null,
): Leaderboard {
  const { totals, thruHole, presses } = matchPairTallies(
    players,
    pars,
    holes,
    scoringMode,
    startingHole,
    holes,
    config,
    events,
  );
  const stake = config?.stake ?? 0;
  const rows = players.map((p) => {
    const n = totals.get(p.id) ?? 0;
    const base = formatMatchPoints(n);
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: n,
      value: stake > 0 ? `${base} · ${fmtMoney(n * stake)}` : base,
    };
  });
  const strokesNote =
    config?.strokesMode === "MANUAL" ? " · manual strokes" : "";
  const pressNote = presses > 0 ? ` · ${presses} press${presses === 1 ? "" : "es"}` : "";
  const stakeNote = stake > 0 ? ` · ${fmtMoney(stake)}/dot` : "";
  const subtitle =
    thruHole === 0
      ? "No holes scored yet"
      : players.length === 2
        ? `Match play · thru ${thruHole}${strokesNote}${pressNote}${stakeNote}`
        : `Round-robin · thru ${thruHole}${strokesNote}${stakeNote}`;
  return {
    key: "MATCH",
    kind: "MATCH",
    title: "Match",
    subtitle,
    rows: rankRows(rows, true),
  };
}

// --- Sixes (18-hole, exactly 4 players) ----------------------------------
// Rotating 2-on-2 partnerships across three 6-hole segments. Players are
// taken in the order passed in (the caller passes seat-sorted players).
// Per-hole compare uses each team's BEST BALL (lower of two teammate net
// scores). Lower team net wins the hole = both teammates +1 dot, losers
// -1, ties wash. Total dots over 18 = leaderboard numeric.
//
// Pairing pattern by segment (0-based):
//   seg 0 (holes 1-6):   [p0,p1] vs [p2,p3]
//   seg 1 (holes 7-12):  [p0,p2] vs [p1,p3]
//   seg 2 (holes 13-18): [p0,p3] vs [p1,p2]
function sixesPartners(
  segmentIdx: number,
  players: LiveScorePlayer[],
): { teamA: [LiveScorePlayer, LiveScorePlayer]; teamB: [LiveScorePlayer, LiveScorePlayer] } | null {
  if (players.length !== 4) return null;
  const [p0, p1, p2, p3] = players;
  if (segmentIdx === 0) return { teamA: [p0, p1], teamB: [p2, p3] };
  if (segmentIdx === 1) return { teamA: [p0, p2], teamB: [p1, p3] };
  if (segmentIdx === 2) return { teamA: [p0, p3], teamB: [p1, p2] };
  return null;
}

function sixesPairTallies(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number,
  upToHoleIdx: number,
): {
  totals: Map<string, number>;
  thruHole: number;
  segmentWins: Map<string, number>;
} {
  const totals = new Map<string, number>();
  const segmentWins = new Map<string, number>();
  for (const p of players) {
    totals.set(p.id, 0);
    segmentWins.set(p.id, 0);
  }
  let thruHole = 0;
  if (players.length !== 4 || holes !== 18) {
    return { totals, thruHole, segmentWins };
  }
  // Per-segment running net difference (teamA - teamB) so we can credit
  // segment wins after the segment closes.
  const segDiff: number[] = [0, 0, 0];
  const segCompleted: boolean[] = [false, false, false];
  for (let i = 0; i < upToHoleIdx; i++) {
    const h = startingHole + i;
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) break;
    const segmentIdx = Math.floor(i / 6);
    const pair = sixesPartners(segmentIdx, players);
    if (!pair) break;
    const netFor = (p: LiveScorePlayer) =>
      netStrokesForHole(
        p.scoresByHole[h] as number,
        p.handicap,
        i,
        holes,
        scoringMode,
      );
    const aBest = Math.min(netFor(pair.teamA[0]), netFor(pair.teamA[1]));
    const bBest = Math.min(netFor(pair.teamB[0]), netFor(pair.teamB[1]));
    if (aBest < bBest) {
      for (const p of pair.teamA) totals.set(p.id, (totals.get(p.id) ?? 0) + 1);
      for (const p of pair.teamB) totals.set(p.id, (totals.get(p.id) ?? 0) - 1);
      segDiff[segmentIdx] -= 1; // teamA up
    } else if (bBest < aBest) {
      for (const p of pair.teamB) totals.set(p.id, (totals.get(p.id) ?? 0) + 1);
      for (const p of pair.teamA) totals.set(p.id, (totals.get(p.id) ?? 0) - 1);
      segDiff[segmentIdx] += 1; // teamB up
    }
    thruHole = h;
    // Credit segment win once the 6th hole of the segment is in.
    const isSegmentLast = (i + 1) % 6 === 0;
    if (isSegmentLast && !segCompleted[segmentIdx]) {
      segCompleted[segmentIdx] = true;
      if (segDiff[segmentIdx] < 0) {
        for (const p of pair.teamA)
          segmentWins.set(p.id, (segmentWins.get(p.id) ?? 0) + 1);
      } else if (segDiff[segmentIdx] > 0) {
        for (const p of pair.teamB)
          segmentWins.set(p.id, (segmentWins.get(p.id) ?? 0) + 1);
      }
    }
  }
  return { totals, thruHole, segmentWins };
}

export function computeSixes(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
  config?: SixesConfig | null,
): Leaderboard | null {
  // Hard gate: Sixes is 4-player 18-hole only. Caller should already have
  // filtered via the requires* flags, but guard here too.
  if (players.length !== 4 || holes !== 18) return null;
  const { totals, thruHole, segmentWins } = sixesPairTallies(
    players,
    pars,
    holes,
    scoringMode,
    startingHole,
    holes,
  );
  const stake = config?.stake ?? 0;
  const rows = players.map((p) => {
    const n = totals.get(p.id) ?? 0;
    const segs = segmentWins.get(p.id) ?? 0;
    const base = `${segs}/3 · ${formatMatchPoints(n)}`;
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: n,
      value: stake > 0 ? `${base} · ${fmtMoney(n * stake)}` : base,
    };
  });
  const stakeNote = stake > 0 ? ` · ${fmtMoney(stake)}/dot` : "";
  const subtitle =
    thruHole === 0
      ? "No holes scored yet"
      : `Rotating partners · thru ${thruHole}${stakeNote}`;
  return {
    key: "SIXES",
    kind: "SIXES",
    title: "Sixes",
    subtitle,
    rows: rankRows(rows, true),
  };
}

// --- Targets ------------------------------------------------------------
// Count qualifying holes per player against a shared target number.
// v1 stats derive from gross strokes vs par; FIR/GIR will plug in
// once per-hole stat capture exists.
function qualifiesForTarget(
  stat: TargetsStat,
  gross: number,
  par: number,
): boolean {
  if (stat === "PAR_OR_BETTER") return gross <= par;
  // BIRDIE_OR_BETTER
  return gross <= par - 1;
}

export function computeTargets(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  config: TargetsConfig,
  startingHole: number = 1,
): Leaderboard {
  let maxScoredHole = 0;
  // First pass: count hits per player.
  const perPlayer = players.map((p) => {
    let hits = 0;
    let played = 0;
    for (let i = 0; i < holes; i++) {
      const h = startingHole + i;
      const gross = p.scoresByHole[h];
      if (typeof gross !== "number") continue;
      played++;
      if (h > maxScoredHole) maxScoredHole = h;
      const par = pars[i] ?? 4;
      if (qualifiesForTarget(config.stat, gross, par)) hits++;
    }
    return { player: p, hits, played, hit: hits >= config.target };
  });

  // Pot math: each winner pulls their share of the losers' antes.
  // If all-hit or no-hit, everyone gets 0 net (effectively refunded).
  const ante = config.ante ?? 0;
  const winners = perPlayer.filter((x) => x.hit);
  const losers = perPlayer.filter((x) => !x.hit);
  const allOrNone =
    ante <= 0 || winners.length === 0 || losers.length === 0;
  const winnerShare =
    !allOrNone && winners.length > 0
      ? (ante * losers.length) / winners.length
      : 0;

  const rows = perPlayer.map((x) => {
    const checkmark = x.hit ? " ✓" : x.played > 0 ? "" : " —";
    let valueText = `${x.hits}/${config.target}${checkmark}`;
    if (ante > 0) {
      const payout = allOrNone ? 0 : x.hit ? winnerShare : -ante;
      valueText = `${valueText} · ${fmtMoney(payout)}`;
    }
    return {
      playerId: x.player.id,
      player: x.player.displayName,
      numeric: x.hits,
      value: valueText,
    };
  });

  const targetLabel = targetsStatLabel(config.stat);
  const baseLine = `${targetLabel} · target ${config.target}`;
  const potLine =
    ante > 0
      ? ` · pot ${fmtMoney(ante * players.length)}${
          allOrNone && winners.length === 0
            ? " (no winners yet)"
            : allOrNone && losers.length === 0
              ? " (refunded — all hit)"
              : ""
        }`
      : "";
  const thruLine =
    maxScoredHole === 0 ? "" : ` · thru ${maxScoredHole}`;
  const subtitle = `${baseLine}${thruLine}${potLine}`;
  return {
    key: "TARGETS",
    kind: "TARGETS",
    title: "Targets",
    subtitle,
    rows: rankRows(rows, true),
  };
}

// --- Nassau (18-hole only) ---
function nassauSegment(
  players: LiveScorePlayer[],
  pars: number[],
  scoringMode: ScoringMode,
  startHole1: number, // 1-based, inclusive
  endHole1: number, // 1-based, inclusive
  totalHoles: number,
  key: string,
  title: string,
): Leaderboard {
  const rows = players.map((p) => {
    let net = 0;
    let counted = 0;
    for (let h = startHole1; h <= endHole1; h++) {
      const gross = p.scoresByHole[h];
      if (typeof gross !== "number") continue;
      net += netStrokesForHole(
        gross,
        p.handicap,
        h - 1,
        totalHoles,
        scoringMode,
      );
      counted++;
    }
    return {
      playerId: p.id,
      player: p.displayName,
      numeric: counted === 0 ? Number.POSITIVE_INFINITY : net,
      value: counted === 0 ? "—" : `${net} (thru ${counted})`,
    };
  });
  return {
    key,
    kind: "NASSAU",
    title,
    rows: rankRows(rows, false),
  };
}

export function computeNassau(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
): Leaderboard[] {
  if (holes !== 18) return [];
  return [
    nassauSegment(
      players,
      pars,
      scoringMode,
      1,
      9,
      holes,
      "NASSAU_FRONT9",
      "Front 9",
    ),
    nassauSegment(
      players,
      pars,
      scoringMode,
      10,
      18,
      holes,
      "NASSAU_BACK9",
      "Back 9",
    ),
    nassauSegment(
      players,
      pars,
      scoringMode,
      1,
      18,
      holes,
      "NASSAU_TOTAL",
      "Total",
    ),
  ];
}

// ---- Team-vs-Team -------------------------------------------------------
// Splits the player list into two teams (from config) and produces a
// single Leaderboard with 2 rows -- one per team. Lower team total wins;
// the per-hole team score is computed via the configured rule. Returns
// null if the config is missing or refers to no playable team.

// Per-hole TVT breakdown used by the match-detail page to render a
// hole-by-hole table with the per-hole winner highlighted. Returns one
// entry per hole; teamA/teamB are null until every team member has
// logged a stroke (or for points-based rules, until both teams have).
export type TeamPlayerHole = {
  playerId: string;
  displayName: string;
  score: number | null;
  // True when this player's score is the one the rule "used" for the
  // team total on this hole. BEST_BALL = the lowest scorer; WORST_BALL
  // = the highest; SUM / AGGREGATE_NET = every player (all true).
  // HIGH_LOW / HIGH_LOW_BALL highlight the team's low (and high for
  // _BALL). VEGAS highlights the lo (tens-digit) score.
  contributed: boolean;
};

export type TeamVsTeamHoleBreakdown = {
  hole: number;
  par: number;
  teamA: number | null;
  teamB: number | null;
  // "A" or "B" wins outright. "TIE" = scored but equal. null = not yet
  // scored.
  winner: "A" | "B" | "TIE" | null;
  // Hint for the renderer: stroke rules show per-team totals; points
  // rules show points awarded (out of 2); vegas shows the 2-digit value.
  scale: "STROKES" | "POINTS" | "VEGAS";
  // Per-player scores + a flag for which one(s) "won the hole" for
  // their team under the active rule. Drives the per-player display
  // on the panel so users can see who carried the team.
  teamAPlayers: TeamPlayerHole[];
  teamBPlayers: TeamPlayerHole[];
};

export function teamVsTeamHoleBreakdown(
  rule: TeamVsTeamRule,
  teamA: LiveScorePlayer[],
  teamB: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number,
): TeamVsTeamHoleBreakdown[] {
  const out: TeamVsTeamHoleBreakdown[] = [];
  const scale: TeamVsTeamHoleBreakdown["scale"] =
    rule === "VEGAS"
      ? "VEGAS"
      : rule === "HIGH_LOW" || rule === "HIGH_LOW_BALL"
        ? "POINTS"
        : "STROKES";

  const teamStrokeFor = (
    team: LiveScorePlayer[],
    holeIndex0: number,
  ): number | null => {
    const hole = startingHole + holeIndex0;
    const strokes: number[] = [];
    for (const p of team) {
      const gross = p.scoresByHole[hole];
      if (typeof gross !== "number") return null;
      const v =
        rule === "AGGREGATE_NET"
          ? netStrokesForHole(gross, p.handicap, holeIndex0, holes, scoringMode)
          : gross;
      strokes.push(v);
    }
    if (strokes.length === 0) return null;
    switch (rule) {
      case "BEST_BALL":
        return Math.min(...strokes);
      case "WORST_BALL":
        return Math.max(...strokes);
      case "SUM":
      case "AGGREGATE_NET":
        return strokes.reduce((a, b) => a + b, 0);
    }
    return null;
  };

  // Build the per-player row template for one team on a given hole.
  // The score field is what to display: for BEST_BALL / WORST_BALL /
  // SUM that's the gross stroke; for AGGREGATE_NET that's the net
  // stroke. `contributed` is filled in later per rule.
  const playerRowsFor = (
    team: LiveScorePlayer[],
    holeIndex0: number,
  ): TeamPlayerHole[] => {
    const hole = startingHole + holeIndex0;
    return team.map((p) => {
      const gross = p.scoresByHole[hole];
      if (typeof gross !== "number") {
        return {
          playerId: p.id,
          displayName: p.displayName,
          score: null,
          contributed: false,
        };
      }
      const v =
        rule === "AGGREGATE_NET"
          ? netStrokesForHole(gross, p.handicap, holeIndex0, holes, scoringMode)
          : gross;
      return {
        playerId: p.id,
        displayName: p.displayName,
        score: v,
        contributed: false,
      };
    });
  };

  const markContributors = (rows: TeamPlayerHole[]) => {
    const scored = rows.filter((r) => r.score != null) as (TeamPlayerHole & {
      score: number;
    })[];
    if (scored.length === 0) return;
    switch (rule) {
      case "BEST_BALL":
      case "HIGH_LOW":
      case "VEGAS": {
        const min = Math.min(...scored.map((r) => r.score));
        for (const r of scored) if (r.score === min) r.contributed = true;
        break;
      }
      case "WORST_BALL": {
        const max = Math.max(...scored.map((r) => r.score));
        for (const r of scored) if (r.score === max) r.contributed = true;
        break;
      }
      case "HIGH_LOW_BALL": {
        const min = Math.min(...scored.map((r) => r.score));
        const max = Math.max(...scored.map((r) => r.score));
        for (const r of scored) {
          if (r.score === min || r.score === max) r.contributed = true;
        }
        break;
      }
      case "SUM":
      case "AGGREGATE_NET": {
        for (const r of scored) r.contributed = true;
        break;
      }
    }
  };

  for (let i = 0; i < holes; i++) {
    const hole = startingHole + i;
    const par = pars[i] ?? 4;
    const teamAPlayers = playerRowsFor(teamA, i);
    const teamBPlayers = playerRowsFor(teamB, i);
    const teamAFullyScored = teamAPlayers.every((r) => r.score != null);
    const teamBFullyScored = teamBPlayers.every((r) => r.score != null);
    if (teamAFullyScored) markContributors(teamAPlayers);
    if (teamBFullyScored) markContributors(teamBPlayers);

    if (rule === "VEGAS") {
      if (teamA.length !== 2 || teamB.length !== 2) {
        out.push({
          hole,
          par,
          teamA: null,
          teamB: null,
          winner: null,
          scale,
          teamAPlayers,
          teamBPlayers,
        });
        continue;
      }
      if (!teamAFullyScored || !teamBFullyScored) {
        out.push({
          hole,
          par,
          teamA: null,
          teamB: null,
          winner: null,
          scale,
          teamAPlayers,
          teamBPlayers,
        });
        continue;
      }
      const a = teamAPlayers.map((r) => r.score as number);
      const b = teamBPlayers.map((r) => r.score as number);
      const aVal = Math.min(...a) * 10 + Math.max(...a);
      const bVal = Math.min(...b) * 10 + Math.max(...b);
      const winner: "A" | "B" | "TIE" =
        aVal < bVal ? "A" : bVal < aVal ? "B" : "TIE";
      out.push({
        hole,
        par,
        teamA: aVal,
        teamB: bVal,
        winner,
        scale,
        teamAPlayers,
        teamBPlayers,
      });
      continue;
    }

    if (rule === "HIGH_LOW" || rule === "HIGH_LOW_BALL") {
      if (!teamAFullyScored || !teamBFullyScored) {
        out.push({
          hole,
          par,
          teamA: null,
          teamB: null,
          winner: null,
          scale,
          teamAPlayers,
          teamBPlayers,
        });
        continue;
      }
      const aStrokes = teamAPlayers.map((r) => r.score as number);
      const bStrokes = teamBPlayers.map((r) => r.score as number);
      let aPts = 0;
      let bPts = 0;
      if (rule === "HIGH_LOW") {
        const aMin = Math.min(...aStrokes);
        const bMin = Math.min(...bStrokes);
        if (aMin < bMin) aPts++;
        else if (bMin < aMin) bPts++;
        const aSum = aStrokes.reduce((x, y) => x + y, 0);
        const bSum = bStrokes.reduce((x, y) => x + y, 0);
        if (aSum < bSum) aPts++;
        else if (bSum < aSum) bPts++;
      } else {
        const aMin = Math.min(...aStrokes);
        const bMin = Math.min(...bStrokes);
        if (aMin < bMin) aPts++;
        else if (bMin < aMin) bPts++;
        const aMax = Math.max(...aStrokes);
        const bMax = Math.max(...bStrokes);
        if (aMax < bMax) aPts++;
        else if (bMax < aMax) bPts++;
      }
      const winner: "A" | "B" | "TIE" =
        aPts > bPts ? "A" : bPts > aPts ? "B" : "TIE";
      out.push({
        hole,
        par,
        teamA: aPts,
        teamB: bPts,
        winner,
        scale,
        teamAPlayers,
        teamBPlayers,
      });
      continue;
    }

    const a = teamAFullyScored ? teamStrokeFor(teamA, i) : null;
    const b = teamBFullyScored ? teamStrokeFor(teamB, i) : null;
    if (a == null || b == null) {
      out.push({
        hole,
        par,
        teamA: a,
        teamB: b,
        winner: null,
        scale,
        teamAPlayers,
        teamBPlayers,
      });
      continue;
    }
    const winner: "A" | "B" | "TIE" = a < b ? "A" : b < a ? "B" : "TIE";
    out.push({
      hole,
      par,
      teamA: a,
      teamB: b,
      winner,
      scale,
      teamAPlayers,
      teamBPlayers,
    });
  }
  return out;
}

export function computeTeamVsTeam(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  config: TeamVsTeamConfig,
  startingHole: number = 1,
): Leaderboard[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamA = config.teams[0]
    .map((id) => byId.get(id))
    .filter((p): p is LiveScorePlayer => p != null);
  const teamB = config.teams[1]
    .map((id) => byId.get(id))
    .filter((p): p is LiveScorePlayer => p != null);
  if (teamA.length === 0 || teamB.length === 0) return [];

  const teamNameA = config.teamNames?.[0] ?? "Team A";
  const teamNameB = config.teamNames?.[1] ?? "Team B";
  const rosterA = `${teamNameA} — ${teamA.map((p) => p.displayName).join(" & ")}`;
  const rosterB = `${teamNameB} — ${teamB.map((p) => p.displayName).join(" & ")}`;

  // Loop over every enabled rule. Each produces its own leaderboard
  // with a unique `key` (TEAM_<RULE>) so the renderer can show multiple
  // panels side-by-side without collisions.
  const out: Leaderboard[] = [];
  for (const ruleConfig of config.rules) {
    const lb = computeTeamVsTeamRule(
      ruleConfig,
      teamA,
      teamB,
      rosterA,
      rosterB,
      pars,
      holes,
      scoringMode,
      startingHole,
    );
    if (lb) out.push(lb);
  }
  return out;
}

function computeTeamVsTeamRule(
  ruleConfig: TeamVsTeamRuleConfig,
  teamA: LiveScorePlayer[],
  teamB: LiveScorePlayer[],
  rosterA: string,
  rosterB: string,
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number,
): Leaderboard | null {
  const config = ruleConfig;
  const ruleKey = `TEAM_${config.rule}`;
  const ruleTitle = teamVsTeamRuleLabel(config.rule);

  // VEGAS: each team's two gross scores form a 2-digit number (low digit
  // first); per-hole points = difference, awarded to the lower team.
  // 2v2 only -- with team sizes != 2, return null so the UI can hint to
  // pick a different rule.
  //
  // Options:
  //   birdieFlip: when a team makes a birdie on the hole, the OTHER
  //     team's score gets flipped (high digit becomes tens place).
  //     Both teams birdie -> both flip (still hurts the loser the most).
  //   doubleHoles: tied holes carry a multiplier into the NEXT hole.
  //     INCREMENTAL grows 1,2,3,4... EXPONENTIAL grows 1,2,4,8... Reset
  //     to 1 on any non-tied hole.
  if (config.rule === "VEGAS") {
    if (teamA.length !== 2 || teamB.length !== 2) return null;
    const opt = config.vegas ?? {};
    const vegasFor = (lo: number, hi: number) => lo * 10 + hi;
    let aPts = 0;
    let bPts = 0;
    let counted = 0;
    let multiplier = 1;
    for (let i = 0; i < holes; i++) {
      const hole = startingHole + i;
      const aScores = teamA.map((p) => p.scoresByHole[hole]);
      const bScores = teamB.map((p) => p.scoresByHole[hole]);
      if (
        aScores.some((s) => typeof s !== "number") ||
        bScores.some((s) => typeof s !== "number")
      )
        continue;
      counted++;
      const a = aScores as number[];
      const b = bScores as number[];
      const par = pars[i] ?? 4;
      const aBirdie = a.some((s) => s < par);
      const bBirdie = b.some((s) => s < par);
      const aLo = Math.min(...a);
      const aHi = Math.max(...a);
      const bLo = Math.min(...b);
      const bHi = Math.max(...b);
      // If the OPPOSING team birdied and birdieFlip is on, your score
      // flips (the high digit goes to the tens place).
      const aFlipped = !!opt.birdieFlip && bBirdie;
      const bFlipped = !!opt.birdieFlip && aBirdie;
      const aVal = aFlipped ? vegasFor(aHi, aLo) : vegasFor(aLo, aHi);
      const bVal = bFlipped ? vegasFor(bHi, bLo) : vegasFor(bLo, bHi);
      const diff = Math.abs(aVal - bVal);
      if (aVal < bVal) {
        aPts += diff * multiplier;
        multiplier = 1;
      } else if (bVal < aVal) {
        bPts += diff * multiplier;
        multiplier = 1;
      } else {
        // Tied hole -- carry the multiplier per doubleHoles mode.
        if (opt.doubleHoles === "INCREMENTAL") multiplier += 1;
        else if (opt.doubleHoles === "EXPONENTIAL") multiplier *= 2;
        // OFF: multiplier stays at 1, tied hole contributes nothing.
      }
    }
    const vStake = config.stake ?? 0;
    const teamSwing = aPts - bPts; // positive => A ahead; signed payout per team.
    const fmtPts = (pts: number, swingFromHere: number) => {
      if (counted === 0) return "—";
      const base = `${pts} pt${pts === 1 ? "" : "s"} (${counted}h)`;
      return vStake > 0 ? `${base} · ${fmtMoney(swingFromHere * vStake)}` : base;
    };
    const stakeNote =
      vStake > 0
        ? `${teamVsTeamRuleBlurb(config.rule)} · ${fmtMoney(vStake)}/pt`
        : teamVsTeamRuleBlurb(config.rule);
    return {
      key: ruleKey,
      kind: "TEAM_VS_TEAM",
      title: ruleTitle,
      subtitle: stakeNote,
      rows: rankRows(
        [
          {
            playerId: teamA[0].id,
            player: rosterA,
            numeric: counted === 0 ? -Infinity : aPts,
            value: fmtPts(aPts, teamSwing),
          },
          {
            playerId: teamB[0].id,
            player: rosterB,
            numeric: counted === 0 ? -Infinity : bPts,
            value: fmtPts(bPts, -teamSwing),
          },
        ],
        true, // higher Vegas points wins
      ),
    };
  }

  // HIGH_LOW and HIGH_LOW_BALL are points-based cross-team comparisons
  // rather than per-team stroke aggregations. Each fully-scored hole
  // awards 2 points; ties push (no point). Higher points wins.
  //   HIGH_LOW:      1 for lowest individual on the hole, 1 for lower team sum.
  //   HIGH_LOW_BALL: 1 for low-ball (lower team min), 1 for high-ball
  //                  (lower team max).
  if (config.rule === "HIGH_LOW" || config.rule === "HIGH_LOW_BALL") {
    let aPts = 0;
    let bPts = 0;
    let counted = 0;
    const collect = (team: LiveScorePlayer[], holeIndex0: number): number[] | null => {
      const hole = startingHole + holeIndex0;
      const strokes: number[] = [];
      for (const p of team) {
        const g = p.scoresByHole[hole];
        if (typeof g !== "number") return null;
        strokes.push(g);
      }
      return strokes.length > 0 ? strokes : null;
    };
    for (let i = 0; i < holes; i++) {
      const aStrokes = collect(teamA, i);
      const bStrokes = collect(teamB, i);
      if (!aStrokes || !bStrokes) continue;
      counted++;
      if (config.rule === "HIGH_LOW") {
        const aMin = Math.min(...aStrokes);
        const bMin = Math.min(...bStrokes);
        if (aMin < bMin) aPts++;
        else if (bMin < aMin) bPts++;
        const aSum = aStrokes.reduce((x, y) => x + y, 0);
        const bSum = bStrokes.reduce((x, y) => x + y, 0);
        if (aSum < bSum) aPts++;
        else if (bSum < aSum) bPts++;
      } else {
        // HIGH_LOW_BALL: low ball + high ball, each a head-to-head.
        const aMin = Math.min(...aStrokes);
        const bMin = Math.min(...bStrokes);
        if (aMin < bMin) aPts++;
        else if (bMin < aMin) bPts++;
        const aMax = Math.max(...aStrokes);
        const bMax = Math.max(...bStrokes);
        if (aMax < bMax) aPts++;
        else if (bMax < aMax) bPts++;
      }
    }
    const ptsStake = config.stake ?? 0;
    const teamSwing = aPts - bPts;
    const fmtPts = (pts: number, swingFromHere: number) => {
      if (counted === 0) return "—";
      const base = `${pts} pt${pts === 1 ? "" : "s"} (${counted}h)`;
      return ptsStake > 0
        ? `${base} · ${fmtMoney(swingFromHere * ptsStake)}`
        : base;
    };
    const subtitle =
      ptsStake > 0
        ? `${teamVsTeamRuleBlurb(config.rule)} · ${fmtMoney(ptsStake)}/pt`
        : teamVsTeamRuleBlurb(config.rule);
    return {
      key: ruleKey,
      kind: "TEAM_VS_TEAM",
      title: ruleTitle,
      subtitle,
      rows: rankRows(
        [
          {
            playerId: teamA[0].id,
            player: rosterA,
            numeric: counted === 0 ? -Infinity : aPts,
            value: fmtPts(aPts, teamSwing),
          },
          {
            playerId: teamB[0].id,
            player: rosterB,
            numeric: counted === 0 ? -Infinity : bPts,
            value: fmtPts(bPts, -teamSwing),
          },
        ],
        true, // higher points wins
      ),
    };
  }

  // Per-hole score for one team under the active stroke-based rule.
  // Returns null when not every team member has logged a stroke yet
  // (rules that need only one player -- BEST_BALL / WORST_BALL --
  // still wait until everyone has scored so the comparison is fair
  // across teams).
  const scoreHole = (
    team: LiveScorePlayer[],
    holeIndex0: number,
  ): number | null => {
    const hole = startingHole + holeIndex0;
    const strokes: number[] = [];
    for (const p of team) {
      const gross = p.scoresByHole[hole];
      if (typeof gross !== "number") return null;
      const value =
        config.rule === "AGGREGATE_NET"
          ? netStrokesForHole(gross, p.handicap, holeIndex0, holes, scoringMode)
          : gross;
      strokes.push(value);
    }
    if (strokes.length === 0) return null;
    switch (config.rule) {
      case "BEST_BALL":
        return Math.min(...strokes);
      case "WORST_BALL":
        return Math.max(...strokes);
      case "SUM":
      case "AGGREGATE_NET":
        return strokes.reduce((a, b) => a + b, 0);
    }
    return null;
  };

  const totalFor = (team: LiveScorePlayer[]) => {
    let total = 0;
    let counted = 0;
    for (let i = 0; i < holes; i++) {
      const s = scoreHole(team, i);
      if (s == null) continue;
      total += s;
      counted++;
    }
    return { total, counted };
  };

  const a = totalFor(teamA);
  const b = totalFor(teamB);

  // For stroke-based rules the wager is $/stroke-of-difference: the
  // losing team's stroke surplus times stake goes to the winner.
  const strokeStake = config.stake ?? 0;
  const both = Math.min(a.counted, b.counted);
  const aWinsBy = both > 0 ? b.total - a.total : 0; // positive => A ahead.
  const fmt = (
    n: { total: number; counted: number },
    moneyFromHere: number,
  ) => {
    if (n.counted === 0) return "—";
    const base = `${n.total} (${n.counted}h)`;
    return strokeStake > 0
      ? `${base} · ${fmtMoney(moneyFromHere * strokeStake)}`
      : base;
  };
  const strokeNote =
    strokeStake > 0
      ? `${teamVsTeamRuleBlurb(config.rule)} · ${fmtMoney(strokeStake)}/stroke`
      : teamVsTeamRuleBlurb(config.rule);

  // Use the captain's matchPlayerId as the row's playerId so the
  // existing leaderboard renderer's keyed lookups don't blow up if
  // they expect a real player id; captain = first member of the team.
  return {
    key: ruleKey,
    kind: "TEAM_VS_TEAM",
    title: ruleTitle,
    subtitle: strokeNote,
    rows: rankRows(
      [
        {
          playerId: teamA[0].id,
          player: rosterA,
          numeric: a.counted === 0 ? Infinity : a.total,
          value: fmt(a, aWinsBy),
        },
        {
          playerId: teamB[0].id,
          player: rosterB,
          numeric: b.counted === 0 ? Infinity : b.total,
          value: fmt(b, -aWinsBy),
        },
      ],
      false, // lower total wins
    ),
  };
}

// ---- Bingo Bango Bongo --------------------------------------------------
// Source data is a list of per-hole event awards. Each event row points to
// one player who scored the event on that hole. Scoring is +1 per event
// awarded; no handicap or par math involved.

export type BbbEvent = {
  hole: number;
  kind: BbbEventKind;
  matchPlayerId: string | null;
};

export function computeBbb(
  players: LiveScorePlayer[],
  events: BbbEvent[],
): Leaderboard {
  const counts: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (const e of events) {
    if (e.matchPlayerId && e.matchPlayerId in counts) {
      counts[e.matchPlayerId] += 1;
    }
  }
  const rows = players.map((p) => ({
    playerId: p.id,
    player: p.displayName,
    numeric: counts[p.id] ?? 0,
    value: `${counts[p.id] ?? 0} pt${(counts[p.id] ?? 0) === 1 ? "" : "s"}`,
  }));
  const totalAwarded = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    key: "BBB",
    kind: "BBB",
    title: "Bingo Bango Bongo",
    subtitle: totalAwarded === 0 ? "No events awarded yet" : undefined,
    rows: rankRows(rows, true),
  };
}

export function runningBbb(
  players: LiveScorePlayer[],
  holes: number,
  events: BbbEvent[],
  startingHole: number = 1,
): RunningSeries {
  const lastHole = startingHole + holes - 1;
  const through = Math.min(
    lastHole,
    events.length === 0
      ? startingHole - 1
      : Math.max(...events.map((e) => e.hole)),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = startingHole; h <= through; h++) {
    for (const e of events) {
      if (e.hole === h && e.matchPlayerId && e.matchPlayerId in totals) {
        totals[e.matchPlayerId] += 1;
      }
    }
    rows.push({ hole: h, ...totals });
  }
  return { rows, current: { ...totals }, throughHole: through };
}

// ---- Snake --------------------------------------------------------------
// Source data: a row per (hole, playerId) for each 3-putt. Multiple players
// can 3-putt on the same hole. Total 3-putts = base leaderboard signal
// (fewer is better). The "current snake holder" is whoever was tagged on
// the highest-numbered hole that has any 3-putt -- if multiple players
// 3-putted on that hole, all of them currently share the snake.

export type SnakeEvent = {
  hole: number;
  matchPlayerId: string;
};

function snakeHolders(events: SnakeEvent[]): Set<string> {
  if (events.length === 0) return new Set();
  const lastHole = Math.max(...events.map((e) => e.hole));
  return new Set(
    events.filter((e) => e.hole === lastHole).map((e) => e.matchPlayerId),
  );
}

export function computeSnake(
  players: LiveScorePlayer[],
  events: SnakeEvent[],
): Leaderboard {
  const counts: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (const e of events) {
    if (e.matchPlayerId in counts) counts[e.matchPlayerId] += 1;
  }
  const holders = snakeHolders(events);
  const rows = players.map((p) => {
    const n = counts[p.id] ?? 0;
    const isHolder = holders.has(p.id);
    return {
      playerId: p.id,
      player: p.displayName,
      // numeric is the 3-putt count; lower is better in this game.
      numeric: n,
      value: isHolder
        ? `${n} 3-putt${n === 1 ? "" : "s"} · holder`
        : `${n} 3-putt${n === 1 ? "" : "s"}`,
    };
  });
  // Lower 3-putt count = better, so rank ascending (no higherIsBetter).
  return {
    key: "SNAKE",
    kind: "SNAKE",
    title: "Snake",
    subtitle:
      events.length === 0
        ? "No 3-putts yet"
        : `Snake holder: ${players
            .filter((p) => holders.has(p.id))
            .map((p) => p.displayName)
            .join(", ")}`,
    rows: rankRows(rows, false),
  };
}

export function runningSnake(
  players: LiveScorePlayer[],
  holes: number,
  events: SnakeEvent[],
  startingHole: number = 1,
): RunningSeries {
  const lastHole = startingHole + holes - 1;
  const through = Math.min(
    lastHole,
    events.length === 0
      ? startingHole - 1
      : Math.max(...events.map((e) => e.hole)),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = startingHole; h <= through; h++) {
    for (const e of events) {
      if (e.hole === h && e.matchPlayerId in totals) {
        totals[e.matchPlayerId] += 1;
      }
    }
    rows.push({ hole: h, ...totals });
  }
  return { rows, current: { ...totals }, throughHole: through };
}

// ---- Wolf ---------------------------------------------------------------
// Wolf rotates by seat order: player at seat ((hole - 1) % N) is the Wolf
// for hole N. Per hole the Wolf either picks a PARTNER (2v2) or goes
// LONE_WOLF (1 v N-1). HOLE_WINNER points to any player on the winning
// team; scoring derives team membership from PARTNER/LONE_WOLF.
//
// Scoring (most common amateur variant):
//   Partner team wins:  Wolf and partner each +2
//   Opponents win:      each opponent +1
//   Lone Wolf wins:     Wolf +4
//   Lone Wolf loses:    each opponent +1
//
// Pre-declared Lone Wolf (double stakes) is intentionally skipped in v1.

export type WolfEvent = {
  hole: number;
  kind: WolfEventKind;
  matchPlayerId: string | null;
};

export type WolfPlayer = LiveScorePlayer & { seat: number };

export function wolfForHole(
  players: WolfPlayer[],
  hole: number,
  rotation?: string[],
  startingHole: number = 1,
): WolfPlayer | null {
  if (players.length === 0) return null;
  // If a custom rotation is provided, use it. Drop any ids no longer in the
  // player list (e.g. someone got removed after the rotation was set), and
  // fall back to seat order if the result is empty.
  let ordered: WolfPlayer[] = [];
  if (rotation && rotation.length > 0) {
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const id of rotation) {
      const p = byId.get(id);
      if (p) ordered.push(p);
    }
  }
  if (ordered.length === 0) {
    ordered = [...players].sort((a, b) => a.seat - b.seat);
  }
  // Rotate based on offset from the first hole played, not absolute hole #.
  return ordered[(hole - startingHole) % ordered.length];
}

type WolfHole = {
  hole: number;
  wolfId: string;
  partnerId: string | null;
  isLoneWolf: boolean;
  // Pre-declared lone wolf (called before any tee shot) -- doubles the stake.
  isPreLoneWolf: boolean;
  winnerId: string | null;
  isPush: boolean;
};

export function shapeWolfHoles(
  players: WolfPlayer[],
  holes: number,
  events: WolfEvent[],
  rotation?: string[],
  startingHole: number = 1,
): WolfHole[] {
  const byHole = new Map<number, WolfEvent[]>();
  for (const e of events) {
    if (!byHole.has(e.hole)) byHole.set(e.hole, []);
    byHole.get(e.hole)!.push(e);
  }
  const out: WolfHole[] = [];
  const lastHole = startingHole + holes - 1;
  for (let h = startingHole; h <= lastHole; h++) {
    const wolf = wolfForHole(players, h, rotation, startingHole);
    if (!wolf) continue;
    const es = byHole.get(h) ?? [];
    const partner = es.find((e) => e.kind === "PARTNER");
    const lone = es.find((e) => e.kind === "LONE_WOLF");
    const preLone = es.find((e) => e.kind === "PRE_LONE_WOLF");
    const manualWinner = es.find((e) => e.kind === "HOLE_WINNER");
    const manualPush = es.some((e) => e.kind === "PUSH");

    // Auto-derive winner from logged scores when (a) no manual winner /
    // push has been recorded, and (b) the wolf has already committed to
    // a partner / lone-wolf choice for the hole. Best-ball within each
    // team -- ties between teams are pushes.
    const partnerId = partner?.matchPlayerId ?? null;
    const isLoneWolf = !!lone || !!preLone;
    const hasChoice = !!partner || isLoneWolf;
    let derivedWinnerId: string | null = null;
    let derivedPush = false;

    if (!manualWinner && !manualPush && hasChoice && players.length >= 2) {
      const strokeFor = (id: string) => players.find((p) => p.id === id)?.scoresByHole[h];
      const wolfStrokes = strokeFor(wolf.id);
      const partnerStrokes = partnerId ? strokeFor(partnerId) : undefined;
      const opponentIds = players
        .map((p) => p.id)
        .filter((id) => id !== wolf.id && id !== partnerId);
      const opponentStrokeList = opponentIds
        .map((id) => strokeFor(id))
        .filter((v): v is number => typeof v === "number");

      const wolfReady = typeof wolfStrokes === "number";
      const partnerReady = !partnerId || typeof partnerStrokes === "number";
      const oppsReady = opponentStrokeList.length === opponentIds.length;
      if (wolfReady && partnerReady && oppsReady) {
        const wolfTeamScore =
          isLoneWolf || !partnerId
            ? (wolfStrokes as number)
            : Math.min(wolfStrokes as number, partnerStrokes as number);
        const oppTeamScore = Math.min(...opponentStrokeList);
        if (wolfTeamScore < oppTeamScore) {
          derivedWinnerId = wolf.id;
        } else if (oppTeamScore < wolfTeamScore) {
          // Pick the lowest-scoring opponent as the team representative
          // so scoreWolfHole still classifies the winning side correctly.
          const idx = opponentStrokeList.indexOf(oppTeamScore);
          derivedWinnerId = opponentIds[idx];
        } else {
          derivedPush = true;
        }
      }
    }

    out.push({
      hole: h,
      wolfId: wolf.id,
      partnerId,
      isLoneWolf,
      isPreLoneWolf: !!preLone,
      winnerId: manualWinner?.matchPlayerId ?? derivedWinnerId,
      isPush: manualPush || derivedPush,
    });
  }
  return out;
}

function scoreWolfHole(
  shaped: WolfHole,
  playerIds: string[],
): Record<string, number> {
  const pts: Record<string, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  if (!shaped.winnerId) return pts;
  const N = playerIds.length;
  // Player-count-aware scoring:
  //   3 players solo (1v2):    wolf win = 2; pair each win = 1
  //   3 players partner (2v1): winning side each = 1 (a 2v1 team point is
  //                            worth 1, not 2 -- the pot is smaller)
  //   4 players solo:          wolf win = 3; others win = 1 each
  //   4 players partner:       winning team each = 2; losing team = 0
  //   5+ (fallback):           wolf solo win = N - 1; others 1 each
  //                            partner: winning team each = 2; losing = 0
  if (shaped.isLoneWolf) {
    // Pre-declared (called BEFORE any tee shot) doubles the stake -- standard
    // golf-bar Wolf rule.
    const multiplier = shaped.isPreLoneWolf ? 2 : 1;
    if (shaped.winnerId === shaped.wolfId) {
      pts[shaped.wolfId] = (N - 1) * multiplier;
    } else {
      for (const id of playerIds) {
        if (id !== shaped.wolfId) pts[id] = 1 * multiplier;
      }
    }
    return pts;
  }
  if (shaped.partnerId) {
    const wolfTeam = new Set([shaped.wolfId, shaped.partnerId]);
    // Per-player payout for the winning side. In a 3-player game the wolf
    // team is 2v1, so each winner earns 1; at 4+ the teams are even (2v2)
    // and each winner earns 2. This applies to whichever side wins.
    const winnerPts = N === 4 ? 2 : 1;
    if (wolfTeam.has(shaped.winnerId)) {
      pts[shaped.wolfId] = winnerPts;
      pts[shaped.partnerId] = winnerPts;
    } else {
      for (const id of playerIds) {
        if (!wolfTeam.has(id)) pts[id] = winnerPts;
      }
    }
  }
  return pts;
}

// Single pass over shaped Wolf holes that applies the push rule. Returns
// per-player running totals plus a hole-by-hole snapshot for the chart.
function tallyWolfHoles(
  shaped: WolfHole[],
  playerIds: string[],
  pushRule: WolfPushRule,
): {
  totals: Record<string, number>;
  rows: ({ hole: number } & Record<string, number>)[];
  resolvedHoles: number;
  lastResolved: number;
} {
  const totals: Record<string, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  let resolvedHoles = 0;
  let lastResolved = 0;
  let carry = 0; // # of pushed holes awaiting payout (ROLLOVER mode only)
  for (const shaped_ of shaped) {
    if (shaped_.isPush) {
      // Pushed hole. Either drag the stake forward or zero it.
      if (pushRule === "ROLLOVER") {
        carry += 1;
        // No row emitted -- the chart line stays flat through pushes.
      }
      continue;
    }
    if (!shaped_.winnerId) continue;
    const add = scoreWolfHole(shaped_, playerIds);
    const multiplier = pushRule === "ROLLOVER" ? 1 + carry : 1;
    for (const id of playerIds) totals[id] += (add[id] ?? 0) * multiplier;
    carry = 0;
    resolvedHoles++;
    lastResolved = shaped_.hole;
    rows.push({ hole: shaped_.hole, ...totals });
  }
  return { totals, rows, resolvedHoles, lastResolved };
}

export function computeWolf(
  players: WolfPlayer[],
  holes: number,
  events: WolfEvent[],
  config: WolfConfig = {},
  startingHole: number = 1,
): Leaderboard {
  const ids = players.map((p) => p.id);
  const pushRule = config.pushRule ?? "NO_POINTS";
  const shaped = shapeWolfHoles(
    players,
    holes,
    events,
    config.rotation,
    startingHole,
  );
  const { totals, resolvedHoles } = tallyWolfHoles(shaped, ids, pushRule);
  const pushed = shaped.filter((s) => s.isPush).length;
  const rows = players.map((p) => ({
    playerId: p.id,
    player: p.displayName,
    numeric: totals[p.id] ?? 0,
    value: `${totals[p.id] ?? 0} pt${(totals[p.id] ?? 0) === 1 ? "" : "s"}`,
  }));
  const parts: string[] = [];
  if (resolvedHoles === 0 && pushed === 0) {
    parts.push("No holes resolved yet");
  } else {
    parts.push(`${resolvedHoles}/${holes} resolved`);
    if (pushed > 0) {
      parts.push(
        `${pushed} push${pushed === 1 ? "" : "es"}${
          pushRule === "ROLLOVER" ? " · rolling over" : ""
        }`,
      );
    }
  }
  return {
    key: "WOLF",
    kind: "WOLF",
    title: "Wolf",
    subtitle: parts.join(" · "),
    rows: rankRows(rows, true),
  };
}

export function runningWolf(
  players: WolfPlayer[],
  holes: number,
  events: WolfEvent[],
  config: WolfConfig = {},
  startingHole: number = 1,
): RunningSeries {
  const ids = players.map((p) => p.id);
  const pushRule = config.pushRule ?? "NO_POINTS";
  const shaped = shapeWolfHoles(
    players,
    holes,
    events,
    config.rotation,
    startingHole,
  );
  const { totals, rows, lastResolved } = tallyWolfHoles(shaped, ids, pushRule);
  return { rows, current: { ...totals }, throughHole: lastResolved };
}

// Dispatch: compute all enabled side games for a match. BBB / Snake / Wolf
// need their event lists since they're not derivable from strokes alone.
export function computeAllSideGames(input: {
  enabled: SideGameKind[];
  players: LiveScorePlayer[];
  // Seat-aware players (only needed for Wolf rotation; ignored elsewhere).
  wolfPlayers?: WolfPlayer[];
  pars: number[];
  holes: number;
  scoringMode: ScoringMode;
  startingHole?: number;
  bbbEvents?: BbbEvent[];
  snakeEvents?: SnakeEvent[];
  wolfEvents?: WolfEvent[];
  wolfConfig?: WolfConfig;
  // Team-vs-team needs team assignments + a scoring rule. Null when
  // the side game is enabled but not yet configured -- the leaderboard
  // is omitted in that case so the UI can show a "configure now" CTA.
  teamVsTeamConfig?: TeamVsTeamConfig | null;
  // Targets needs a stat + target number. Null = enabled but not yet
  // configured -- leaderboard omitted, UI prompts for config.
  targetsConfig?: TargetsConfig | null;
  // Match strokes mode + manual stroke overrides. Null = AUTO (current
  // default behavior using the match-level scoringMode + handicaps).
  matchConfig?: MatchConfig | null;
  // Manual press events recorded against the Match side game. Each
  // event spawns a fresh press line on its hole+1.
  matchEvents?: MatchEvent[];
  // Sixes stake (per dot). Null = no $ values shown.
  sixesConfig?: SixesConfig | null;
  // Skins tie-handling rule. Null = CARRYOVER (default behavior).
  skinsConfig?: SkinsConfig | null;
}): { kind: SideGameKind; leaderboards: Leaderboard[] }[] {
  const {
    enabled,
    players,
    wolfPlayers = [],
    pars,
    holes,
    scoringMode,
    startingHole = 1,
    bbbEvents = [],
    snakeEvents = [],
    wolfEvents = [],
    wolfConfig = {},
    teamVsTeamConfig = null,
    targetsConfig = null,
    matchConfig = null,
    matchEvents = [],
    sixesConfig = null,
    skinsConfig = null,
  } = input;
  const out: { kind: SideGameKind; leaderboards: Leaderboard[] }[] = [];
  for (const kind of enabled) {
    if (kind === "STABLEFORD") {
      out.push({
        kind,
        leaderboards: [
          computeStableford(players, pars, holes, scoringMode, startingHole),
        ],
      });
    } else if (kind === "SKINS") {
      out.push({
        kind,
        leaderboards: [
          computeSkins(
            players,
            pars,
            holes,
            scoringMode,
            startingHole,
            skinsConfig,
          ),
        ],
      });
    } else if (kind === "NASSAU") {
      const lbs = computeNassau(players, pars, holes, scoringMode);
      if (lbs.length > 0) out.push({ kind, leaderboards: lbs });
    } else if (kind === "BBB") {
      out.push({ kind, leaderboards: [computeBbb(players, bbbEvents)] });
    } else if (kind === "SNAKE") {
      out.push({ kind, leaderboards: [computeSnake(players, snakeEvents)] });
    } else if (kind === "WOLF") {
      out.push({
        kind,
        leaderboards: [
          computeWolf(
            wolfPlayers,
            holes,
            wolfEvents,
            wolfConfig,
            startingHole,
          ),
        ],
      });
    } else if (kind === "TEAM_VS_TEAM") {
      // Skip when not yet configured -- UI shows the configure CTA.
      if (!teamVsTeamConfig) continue;
      const lbs = computeTeamVsTeam(
        players,
        pars,
        holes,
        scoringMode,
        teamVsTeamConfig,
        startingHole,
      );
      if (lbs.length > 0) out.push({ kind, leaderboards: lbs });
    } else if (kind === "MATCH") {
      out.push({
        kind,
        leaderboards: [
          computeMatch(
            players,
            pars,
            holes,
            scoringMode,
            startingHole,
            matchConfig,
            matchEvents,
          ),
        ],
      });
    } else if (kind === "SIXES") {
      const lb = computeSixes(
        players,
        pars,
        holes,
        scoringMode,
        startingHole,
        sixesConfig,
      );
      if (lb) out.push({ kind, leaderboards: [lb] });
    } else if (kind === "TARGETS") {
      if (!targetsConfig) continue;
      out.push({
        kind,
        leaderboards: [
          computeTargets(players, pars, holes, targetsConfig, startingHole),
        ],
      });
    }
  }
  return out;
}

export function isSideGameKind(s: string): s is SideGameKind {
  return (
    s === "STABLEFORD" ||
    s === "SKINS" ||
    s === "NASSAU" ||
    s === "BBB" ||
    s === "SNAKE" ||
    s === "WOLF" ||
    s === "TEAM_VS_TEAM" ||
    s === "MATCH" ||
    s === "SIXES" ||
    s === "TARGETS"
  );
}

// ---- Running (hole-by-hole) series for charts ---------------------------
// Each function returns rows of the form { hole: N, [playerId]: value } so
// the chart layer can pass it directly to Recharts.

export type RunningSeries = {
  rows: ({ hole: number } & Record<string, number>)[];
  // The cumulative value at the final available hole, per player. Used as
  // the chart's "current" label.
  current: Record<string, number>;
  // Highest plotted hole index (for the X domain).
  throughHole: number;
};

function maxHolesAcross(players: LiveScorePlayer[]): number {
  return Math.max(
    0,
    ...players.map((p) => {
      const keys = Object.keys(p.scoresByHole).map(Number);
      return keys.length === 0 ? 0 : Math.max(...keys);
    }),
  );
}

export function runningStableford(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
): RunningSeries {
  const lastHole = startingHole + holes - 1;
  const through = Math.min(lastHole, maxHolesAcross(players));
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const totals: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  for (let h = startingHole; h <= through; h++) {
    const offset = h - startingHole;
    for (const p of players) {
      const gross = p.scoresByHole[h];
      if (typeof gross === "number") {
        const par = pars[offset] ?? 4;
        const net = netStrokesForHole(
          gross,
          p.handicap,
          offset,
          holes,
          scoringMode,
        );
        totals[p.id] = (totals[p.id] ?? 0) + stablefordPointsFromNet(net, par);
      }
    }
    rows.push({ hole: h, ...totals });
  }
  return { rows, current: { ...totals }, throughHole: through };
}

export function runningSkins(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
): RunningSeries {
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const counts: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  let carryover = 1;
  let through = 0;
  const lastHole = startingHole + holes - 1;
  for (let h = startingHole; h <= lastHole; h++) {
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) break;
    const offset = h - startingHole;
    const nets = players.map((p) => ({
      id: p.id,
      net: netStrokesForHole(
        p.scoresByHole[h] as number,
        p.handicap,
        offset,
        holes,
        scoringMode,
      ),
    }));
    const low = Math.min(...nets.map((n) => n.net));
    const winners = nets.filter((n) => n.net === low);
    if (winners.length === 1) {
      counts[winners[0].id] += carryover;
      carryover = 1;
    } else {
      carryover += 1;
    }
    rows.push({ hole: h, ...counts });
    through = h;
  }
  return { rows, current: { ...counts }, throughHole: through };
}

// Nassau running net relative to par over a segment (front/back/total).
// X = hole offset within the segment (1..segLength), Y = net-to-par.
export function runningNassauSegment(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  start1: number,
  end1: number,
): RunningSeries {
  const through = Math.min(end1, maxHolesAcross(players));
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const running: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  let lastHole = 0;
  for (let h = start1; h <= through; h++) {
    for (const p of players) {
      const gross = p.scoresByHole[h];
      if (typeof gross === "number") {
        const par = pars[h - 1] ?? 4;
        const net = netStrokesForHole(
          gross,
          p.handicap,
          h - 1,
          holes,
          scoringMode,
        );
        running[p.id] = (running[p.id] ?? 0) + (net - par);
      }
    }
    rows.push({ hole: h - start1 + 1, ...running });
    lastHole = h;
  }
  return {
    rows,
    current: { ...running },
    throughHole: lastHole === 0 ? 0 : lastHole - start1 + 1,
  };
}

// Match-play running series: cumulative pair-tally after each fully-scored
// hole. Series stops at the first hole missing any player's stroke so the
// chart doesn't draw forward through gaps.
export function runningMatch(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
  config?: MatchConfig | null,
  events?: MatchEvent[] | null,
): RunningSeries {
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const running: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  const isTwoPlayer = players.length === 2;
  const manualPressHoles = new Set<number>();
  if (isTwoPlayer && events) {
    for (const e of events) {
      if (e.kind === "PRESS") manualPressHoles.add(e.hole);
    }
  }
  const pressActive =
    isTwoPlayer && (!!config?.autoPress || manualPressHoles.size > 0);
  const pressThreshold = Math.max(
    1,
    Math.floor(config?.autoPressThreshold ?? 2),
  );
  const lines: { startHole: number; diff: number; pressed: boolean }[] = [
    { startHole: 0, diff: 0, pressed: false },
  ];
  let through = 0;
  for (let i = 0; i < holes; i++) {
    const h = startingHole + i;
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) break;
    const nets = players.map((p) => {
      const eff = matchEffective(config, scoringMode, p.id, p.handicap);
      return {
        id: p.id,
        net: netStrokesForHole(
          p.scoresByHole[h] as number,
          eff.hcp,
          i,
          holes,
          eff.mode,
        ),
      };
    });
    if (pressActive) {
      let delta = 0;
      if (nets[0].net < nets[1].net) delta = 1;
      else if (nets[1].net < nets[0].net) delta = -1;
      for (const line of lines) {
        if (line.startHole > i) continue;
        line.diff += delta;
      }
      if (config?.autoPress) {
        const trigger = lines
          .filter((l) => !l.pressed && Math.abs(l.diff) >= pressThreshold)
          .pop();
        if (trigger && i + 1 < holes) {
          trigger.pressed = true;
          lines.push({ startHole: i + 1, diff: 0, pressed: false });
        }
      }
      if (manualPressHoles.has(h) && i + 1 < holes) {
        const target = [...lines].reverse().find((l) => !l.pressed);
        if (target) target.pressed = true;
        lines.push({ startHole: i + 1, diff: 0, pressed: false });
      }
      const sum = lines.reduce((a, l) => a + l.diff, 0);
      running[players[0].id] = sum;
      running[players[1].id] = -sum;
      rows.push({ hole: h, ...running });
      through = h;
      continue;
    }
    for (let a = 0; a < nets.length; a++) {
      for (let b = a + 1; b < nets.length; b++) {
        if (nets[a].net < nets[b].net) {
          running[nets[a].id] = (running[nets[a].id] ?? 0) + 1;
          running[nets[b].id] = (running[nets[b].id] ?? 0) - 1;
        } else if (nets[b].net < nets[a].net) {
          running[nets[b].id] = (running[nets[b].id] ?? 0) + 1;
          running[nets[a].id] = (running[nets[a].id] ?? 0) - 1;
        }
      }
    }
    rows.push({ hole: h, ...running });
    through = h;
  }
  return { rows, current: { ...running }, throughHole: through };
}

// Sixes running series: cumulative pair-tally over the 3 partnership
// segments. Returns an empty series when the match isn't a 4-player
// 18-hole setup.
export function runningSixes(
  players: LiveScorePlayer[],
  pars: number[],
  holes: number,
  scoringMode: ScoringMode,
  startingHole: number = 1,
): RunningSeries {
  const rows: ({ hole: number } & Record<string, number>)[] = [];
  const running: Record<string, number> = Object.fromEntries(
    players.map((p) => [p.id, 0]),
  );
  if (players.length !== 4 || holes !== 18) {
    return { rows, current: { ...running }, throughHole: 0 };
  }
  let through = 0;
  for (let i = 0; i < holes; i++) {
    const h = startingHole + i;
    if (players.some((p) => typeof p.scoresByHole[h] !== "number")) break;
    const segmentIdx = Math.floor(i / 6);
    const pair = sixesPartners(segmentIdx, players);
    if (!pair) break;
    const netFor = (p: LiveScorePlayer) =>
      netStrokesForHole(
        p.scoresByHole[h] as number,
        p.handicap,
        i,
        holes,
        scoringMode,
      );
    const aBest = Math.min(netFor(pair.teamA[0]), netFor(pair.teamA[1]));
    const bBest = Math.min(netFor(pair.teamB[0]), netFor(pair.teamB[1]));
    if (aBest < bBest) {
      for (const p of pair.teamA)
        running[p.id] = (running[p.id] ?? 0) + 1;
      for (const p of pair.teamB)
        running[p.id] = (running[p.id] ?? 0) - 1;
    } else if (bBest < aBest) {
      for (const p of pair.teamB)
        running[p.id] = (running[p.id] ?? 0) + 1;
      for (const p of pair.teamA)
        running[p.id] = (running[p.id] ?? 0) - 1;
    }
    rows.push({ hole: h, ...running });
    through = h;
  }
  return { rows, current: { ...running }, throughHole: through };
}
