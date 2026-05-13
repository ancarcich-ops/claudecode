// Hybrid odds engine.
//
// For each match we produce a probability vector over players that sums to 1.
// Three signals are blended:
//   1. Model prior from handicap differential (always available).
//   2. Crowd signal from wager counts (Laplace-smoothed share).
//   3. Live signal from in-progress scoring vs handicap-adjusted pace.
//
// Blend weights shift as more information arrives:
//   UPCOMING: model dominates until wagers stack up.
//   IN_PROGRESS: live grows linearly with holes completed.
//   COMPLETED: deterministic — winner = lowest net score (1.0 vs 0.0).

export type PlayerInput = {
  id: string;
  handicap: number;
  wagerCount: number;
  // hole -> strokes, only for holes already played
  scoresByHole: Record<number, number>;
};

export type OddsInput = {
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  holes: number;
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

// Handicap prior: lower handicap = better. We model expected net-par strokes
// for the round as -handicap, then convert to win probability via softmax over
// the negative-handicap "skill" with a fairly flat temperature so a 5-stroke
// gap is meaningful but not overwhelming pre-round.
function modelProbabilities(players: PlayerInput[]): number[] {
  const skill = players.map((p) => -p.handicap);
  return softmax(skill, 6);
}

// Crowd: Laplace-smoothed share of wagers. Smoothing keeps a fresh market
// from snapping to 100% on the first wager.
function crowdProbabilities(players: PlayerInput[]): number[] {
  const alpha = 1;
  const raw = players.map((p) => p.wagerCount + alpha);
  return normalize(raw);
}

// Live: project final net score from current pace, then softmax.
// For each player: holes_played strokes are known. Remaining holes are
// projected at the player's *expected per-hole rate* implied by their
// handicap (par + handicap/holes). Net = projected_total - handicap.
// Lower net = better, so we feed -net into softmax with a tight
// temperature so a 2-stroke lead with few holes left is decisive.
function liveProbabilities(
  players: PlayerInput[],
  totalHoles: number,
  parPerHole = 4,
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

  for (const p of players) {
    const holesPlayed = Object.keys(p.scoresByHole).length;
    const strokesSoFar = Object.values(p.scoresByHole).reduce(
      (a, b) => a + b,
      0,
    );
    const holesRemaining = totalHoles - holesPlayed;
    const expectedRemainingRate = parPerHole + p.handicap / totalHoles;
    const projectedTotal =
      strokesSoFar + holesRemaining * expectedRemainingRate;
    const projectedNet = projectedTotal - p.handicap;
    projectedNets.push(projectedNet);
    reportedNets.push(projectedNet);
  }

  // Confidence ramps as more holes are played: temperature shrinks from 4 to 1.
  const t = 4 - 3 * (maxHolesPlayed / totalHoles);
  const probs = softmax(
    projectedNets.map((n) => -n),
    Math.max(1, t),
  );
  return { probs, netScores: reportedNets, holesPlayed: maxHolesPlayed };
}

function completedProbabilities(
  players: PlayerInput[],
): { probs: number[]; netScores: (number | null)[] } {
  const nets = players.map((p) => {
    const total = Object.values(p.scoresByHole).reduce((a, b) => a + b, 0);
    return total - p.handicap;
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
  const n = players.length;

  const model = modelProbabilities(players);
  const crowd = crowdProbabilities(players);
  const totalWagers = players.reduce((a, p) => a + p.wagerCount, 0);

  if (status === "COMPLETED") {
    const { probs, netScores } = completedProbabilities(players);
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
      },
    };
  }

  if (status === "IN_PROGRESS") {
    const { probs: live, netScores, holesPlayed } = liveProbabilities(
      players,
      holes,
    );
    const liveWeight = Math.min(0.95, holesPlayed / holes);
    const remaining = 1 - liveWeight;
    // Of the remaining weight, give the crowd up to 0.5 once it has volume.
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
