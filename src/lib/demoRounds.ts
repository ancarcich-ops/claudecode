// Reference rounds for the "demo history" import. Used by both the
// /settings one-click importer and the standalone CLI seed script.
//
// Edit this list when you want new historical rounds to show up for
// users who hit the importer.

export type DemoRound = {
  scheduledAt: Date;
  courseName: string;
  pars: number[];
  totalOverPar: number;
  // 1 for full / front-9, 10 for back-9.
  startingHole?: number;
};

const PAR_18_72 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const TORREY_NORTH = [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5, 5, 3, 4, 4]; // par 72
const ALONDRA_18 = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 4, 3, 5, 4, 4, 5];
const ALONDRA_FRONT_9 = ALONDRA_18.slice(0, 9); // par 36

// Reference rounds from the user's screenshots. Excludes the 5/8 Alondra
// (34 / +2) per their note.
export const DEMO_ROUNDS: DemoRound[] = [
  {
    scheduledAt: new Date("2026-05-15T15:00:00-07:00"),
    courseName: "Alondra Park GC - North",
    pars: ALONDRA_FRONT_9,
    totalOverPar: 5, // 41 on par 36
  },
  {
    scheduledAt: new Date("2026-05-01T15:00:00-07:00"),
    courseName: "Escena GC",
    pars: PAR_18_72,
    totalOverPar: 13, // 85 on par 72
  },
  {
    scheduledAt: new Date("2026-04-18T15:00:00-07:00"),
    courseName: "Recreation Park - South 9",
    pars: [3, 4, 3, 4, 3, 3, 3, 4, 4], // par 31 executive
    totalOverPar: 11, // 42 on par 31
  },
  {
    scheduledAt: new Date("2026-04-12T15:00:00-07:00"),
    courseName: "Torrey Pines GC - North",
    pars: TORREY_NORTH,
    totalOverPar: 16, // 88 on par 72
  },
  {
    scheduledAt: new Date("2026-04-03T15:00:00-07:00"),
    courseName: "Alondra Park GC - North",
    pars: ALONDRA_18,
    totalOverPar: 16, // 88 on par 72
  },
  {
    scheduledAt: new Date("2026-03-19T15:00:00-07:00"),
    courseName: "Wolf Creek Golf Club",
    // 17 holes played, par 68 (3 par-3s, 12 par-4s, 2 par-5s = 67; bump
    // one 4 to 5 -> 68).
    pars: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 5, 4],
    totalOverPar: 17, // 85 on par 68
  },
];

// Deterministic LCG so the per-hole scorecards stay stable across reruns.
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Spread a target "over par" across holes as a mix of one birdie or two,
// a handful of pars, mostly bogeys, and a few doubles. Deterministic
// from the seed so the same round always produces the same scorecard.
export function generateScores(
  pars: number[],
  totalOverPar: number,
  seed: number,
): number[] {
  const diffs = pars.map(() => 0);
  let target = totalOverPar;
  const rand = rng(seed);

  // One or two birdies per round for texture.
  const birdiesToAdd = Math.min(2, Math.floor(pars.length / 9));
  for (let i = 0; i < birdiesToAdd; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const idx = Math.floor(rand() * pars.length);
      if (diffs[idx] === 0) {
        diffs[idx] = -1;
        target += 1;
        break;
      }
    }
  }

  // Distribute remaining over-par as bogeys then doubles.
  let safety = pars.length * 6;
  while (target > 0 && safety-- > 0) {
    const idx = Math.floor(rand() * pars.length);
    if (diffs[idx] === 0) {
      diffs[idx] = rand() < 0.7 ? 1 : 2;
      target -= diffs[idx];
    } else if (diffs[idx] === 1 && target > 0) {
      diffs[idx] = 2;
      target -= 1;
    } else if (diffs[idx] === 2 && target > 0) {
      diffs[idx] = 3;
      target -= 1;
    }
  }

  // If we overshot (picked a double when target=1), back one off.
  while (target < 0) {
    const overshootIdx = diffs.findIndex((d) => d >= 2);
    if (overshootIdx === -1) break;
    diffs[overshootIdx] -= 1;
    target += 1;
  }

  return diffs.map((d, i) => Math.max(1, pars[i] + d));
}
