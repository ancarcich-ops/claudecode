// Hybrid odds engine.
//
// For each match we produce a probability vector over players that sums to 1.
// Three signals are blended:
//   1. Model prior from handicap differential (always available).
//   2. Crowd signal from wager counts (Laplace-smoothed share).
//   3. Live signal from in-progress scoring vs handicap-adjusted pace,
//      using per-hole par data when available.
//
// Blend weights shift as more information arrives:
//   UPCOMING: model dominates until wagers stack up.
//   IN_PROGRESS: live grows linearly with holes completed.
//   COMPLETED: deterministic - winner = lowest net score (1.0 vs 0.0).

export type PlayerInput = {
  id: string;
  handicap: number;
  wagerCount: number;
  // hole -> strokes, only for holes already played
  scoresByHole: Record<number, number>;
};

export type ScoringMode = "NET" | "GROSS" | "CUSTOM";

export type OddsInput = {
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  holes: number;
  // Per-hole pars (1-indexed by position, length == holes). If omitted,
  // engine assumes par 4 for every hole.
  pars?: number[];
  // NET/CUSTOM subtract the per-player allowance (handicap or agreed strokes)
  // from gross to determine the winner. GROSS uses raw strokes. Default NET.
  scoringMode?: ScoringMode;
  // First hole played (1 for full/front-9, 10 for back-9). scoresByHole keys
  // are absolute hole numbers; pars is length=holes indexed from startingHole.
  startingHole?: number;
  players: PlayerInput[];
};

export type OddsOutput = {
  probabilities: Record<string, number>;
  components: {
    model: Record<string, number>;
    crowd: Record<string, number>;
    live: Record<string, number>;
  };
  weights: { model: number; crowd: number; live: number };
  meta: {
    holesPlayed: number;
    totalWagers: number;
    netScores: Record<string, number | null>;
    coursePar: number;
  };
};

const EPSILON = 1e-6;

function softmax(scores: number[], temperature = 1): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function normalize(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 1 / values.length);
  return values.map((v) => v / sum);
}

function resolvePars(holes: number, pars?: number[]): number[] {
  if (!pars || pars.length === 0) return Array(holes).fill(4);
  if (pars.length === holes) return pars;
  // Tolerate mismatch by trimming or padding with 4s.
  const out = pars.slice(0, holes);
  while (out.length < holes) out.push(4);
  return out;
}

// Handicap prior: lower handicap = better. We model expected net-par strokes
// for the round as -handicap, then convert to win probability via softmax over
// the negative-handicap "skill". Temperature 4 (was 6): a 5-stroke gap reads
// as ~78/22 and a 10-stroke gap ~92/8 so the favorite actually looks like
// the favorite, without going fully deterministic on a 15-handicap gap.
function modelProbabilities(players: PlayerInput[]): number[] {
  const skill = players.map((p) => -p.handicap);
  return softmax(skill, 4);
}

// Crowd: Laplace-smoothed share of wagers. Smoothing keeps a fresh market
// from snapping to 100% on the first wager.
function crowdProbabilities(players: PlayerInput[]): number[] {
  const alpha = 1;
  const raw = players.map((p) => p.wagerCount + alpha);
  return normalize(raw);
}

// Live: project final net score from current pace using per-hole pars.
// For each player:
//   strokes_so_far   = sum of strokes on holes played
//   par_so_far       = sum of pars on holes played
//   diff_per_hole    = (strokes_so_far - par_so_far) / holes_played
//   prior_diff       = handicap / totalHoles   (their expected over-par rate)
//   blended_rate     = lerp(prior_diff, diff_per_hole, holes_played/totalHoles)
//   remaining        = sum of pars on holes left + remaining * blended_rate
//   projected_total  = strokes_so_far + remaining
//   net              = projected_total - handicap
// Softmax(-net) with a temperature that tightens as holes are played.
function liveProbabilities(
  players: PlayerInput[],
  totalHoles: number,
  pars: number[],
  scoringMode: ScoringMode,
  startingHole: number,
): { probs: number[]; netScores: (number | null)[]; holesPlayed: number } {
  const maxHolesPlayed = Math.max(
    0,
    ...players.map((p) => Object.keys(p.scoresByHole).length),
  );

  if (maxHolesPlayed === 0) {
    const flat = players.map(() => 1 / players.length);
    return { probs: flat, netScores: players.map(() => null), holesPlayed: 0 };
  }

  const projectedNets: number[] = [];
  const reportedNets: (number | null)[] = [];
  const lastHole = startingHole + totalHoles - 1;

  for (const p of players) {
    const playedHoles = Object.keys(p.scoresByHole)
      .map(Number)
      .filter((h) => h >= startingHole && h <= lastHole);
    const holesPlayed = playedHoles.length;
    const strokesSoFar = playedHoles.reduce(
      (s, h) => s + (p.scoresByHole[h] ?? 0),
      0,
    );
    const parSoFar = playedHoles.reduce(
      (s, h) => s + (pars[h - startingHole] ?? 4),
      0,
    );
    const remainingPar = pars.reduce(
      (s, par, i) => (playedHoles.includes(startingHole + i) ? s : s + par),
      0,
    );
    const holesRemaining = totalHoles - holesPlayed;

    const priorRate = p.handicap / totalHoles; // expected over-par per hole
    const observedRate =
      holesPlayed > 0 ? (strokesSoFar - parSoFar) / holesPlayed : priorRate;
    // Convex blend (was linear) so the first few holes don't overweight
    // small samples. At hole 3 of 18 observed pace counts ~7% instead
    // of 17%; by the back nine the curves converge.
    const blend = Math.pow(holesPlayed / totalHoles, 1.5);
    const blendedRate = (1 - blend) * priorRate + blend * observedRate;

    const projectedRemaining = remainingPar + holesRemaining * blendedRate;
    const projectedTotal = strokesSoFar + projectedRemaining;
    const allowance = scoringMode === "GROSS" ? 0 : p.handicap;
    const projectedNet = projectedTotal - allowance;
    projectedNets.push(projectedNet);
    reportedNets.push(projectedNet);
  }

  const t = 4 - 3 * (maxHolesPlayed / totalHoles);
  const probs = softmax(
    projectedNets.map((n) => -n),
    Math.max(1, t),
  );
  return { probs, netScores: reportedNets, holesPlayed: maxHolesPlayed };
}

function completedProbabilities(
  players: PlayerInput[],
  scoringMode: ScoringMode,
): { probs: number[]; netScores: (number | null)[] } {
  const nets = players.map((p) => {
    const total = Object.values(p.scoresByHole).reduce((a, b) => a + b, 0);
    const allowance = scoringMode === "GROSS" ? 0 : p.handicap;
    return total - allowance;
  });
  const min = Math.min(...nets);
  const winners: number[] = nets.map((n) =>
    Math.abs(n - min) < EPSILON ? 1 : 0,
  );
  const winCount = winners.reduce((a, b) => a + b, 0) || 1;
  return {
    probs: winners.map((w) => w / winCount),
    netScores: nets,
  };
}

export function computeOdds(input: OddsInput): OddsOutput {
  const { players, holes, status } = input;
  const scoringMode: ScoringMode = input.scoringMode ?? "NET";
  const startingHole = input.startingHole ?? 1;
  const n = players.length;
  const pars = resolvePars(holes, input.pars);
  const coursePar = pars.reduce((a, b) => a + b, 0);

  const model = modelProbabilities(players);
  const crowd = crowdProbabilities(players);
  const totalWagers = players.reduce((a, p) => a + p.wagerCount, 0);

  if (status === "COMPLETED") {
    const { probs, netScores } = completedProbabilities(players, scoringMode);
    return {
      probabilities: zip(players, probs),
      components: {
        model: zip(players, model),
        crowd: zip(players, crowd),
        live: zip(players, probs),
      },
      weights: { model: 0, crowd: 0, live: 1 },
      meta: {
        holesPlayed: holes,
        totalWagers,
        netScores: zipNullable(players, netScores),
        coursePar,
      },
    };
  }

  if (status === "IN_PROGRESS") {
    const { probs: live, netScores, holesPlayed } = liveProbabilities(
      players,
      holes,
      pars,
      scoringMode,
      startingHole,
    );
    // Live channel weight ramps in convex too -- early holes shouldn't
    // dictate the line even if the projection itself looks confident.
    const liveWeight = Math.min(0.95, Math.pow(holesPlayed / holes, 1.5));
    const remaining = 1 - liveWeight;
    const crowdWeight =
      remaining * Math.min(0.7, totalWagers / (totalWagers + 4));
    const modelWeight = remaining - crowdWeight;

    const blended = players.map(
      (_, i) =>
        modelWeight * model[i] + crowdWeight * crowd[i] + liveWeight * live[i],
    );
    return {
      probabilities: zip(players, normalize(blended)),
      components: {
        model: zip(players, model),
        crowd: zip(players, crowd),
        live: zip(players, live),
      },
      weights: { model: modelWeight, crowd: crowdWeight, live: liveWeight },
      meta: {
        holesPlayed,
        totalWagers,
        netScores: zipNullable(players, netScores),
        coursePar,
      },
    };
  }

  // UPCOMING
  const crowdWeight = Math.min(0.7, totalWagers / (totalWagers + 5));
  const modelWeight = 1 - crowdWeight;
  const blended = players.map(
    (_, i) => modelWeight * model[i] + crowdWeight * crowd[i],
  );

  return {
    probabilities: zip(players, normalize(blended)),
    components: {
      model: zip(players, model),
      crowd: zip(players, crowd),
      live: zip(players, players.map(() => 1 / n)),
    },
    weights: { model: modelWeight, crowd: crowdWeight, live: 0 },
    meta: {
      holesPlayed: 0,
      totalWagers,
      netScores: Object.fromEntries(players.map((p) => [p.id, null])),
      coursePar,
    },
  };
}

function zip(players: PlayerInput[], values: number[]): Record<string, number> {
  return Object.fromEntries(players.map((p, i) => [p.id, values[i]]));
}

function zipNullable(
  players: PlayerInput[],
  values: (number | null)[],
): Record<string, number | null> {
  return Object.fromEntries(players.map((p, i) => [p.id, values[i]]));
}

export function formatPct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

// Build a reasonable default par array. Most courses are par-72/36, with a
// mix of 4s, a few 3s, a few 5s. Good enough for first-pass odds.
export function defaultPars(holes: 9 | 18): number[] {
  if (holes === 9) return [4, 4, 3, 5, 4, 4, 3, 4, 5];
  return [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
}

export function parseParData(json: string | null, holes: number): number[] {
  if (!json) return Array(holes).fill(4);
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return Array(holes).fill(4);
    return resolveLength(parsed.map((v) => clampPar(Number(v))), holes);
  } catch {
    return Array(holes).fill(4);
  }
}

function resolveLength(arr: number[], holes: number): number[] {
  const out = arr.slice(0, holes);
  while (out.length < holes) out.push(4);
  return out;
}

function clampPar(v: number): number {
  if (!Number.isFinite(v)) return 4;
  if (v < 3) return 3;
  if (v > 6) return 6;
  return Math.round(v);
}
