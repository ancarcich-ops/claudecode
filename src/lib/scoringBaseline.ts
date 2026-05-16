// Baseline expectations for a given Handicap Index.
//
// Used by the personal-stats page to give users a "vs a 10 handicap" view of
// their actual scoring. There's no real population data yet, so we lean on
// known anchor points (USGA & published amateur-distribution work) and
// linearly interpolate between them. As app-wide data accumulates we can
// swap this for a percentile pull.

export const BASELINE_HANDICAPS = [0, 5, 10, 15, 20, 25, 30] as const;
export type BaselineHandicap = (typeof BASELINE_HANDICAPS)[number];

export type ExpectedAvgScores = { par3: number; par4: number; par5: number };

// Expected average score on a hole of each par for a given Handicap Index.
// Per-hole strokes-over-par scales linearly with HI (hcp / 18). Par 3s eat
// slightly less of the budget, par 5s slightly more, since longer holes
// punish higher handicaps more.
export function expectedAvgScores(hcp: number): ExpectedAvgScores {
  const perHole = hcp / 18;
  return {
    par3: 3 + perHole * 0.85,
    par4: 4 + perHole * 1.0,
    par5: 5 + perHole * 1.15,
  };
}

export type ExpectedDistribution = {
  birdiesOrBetter: number;
  pars: number;
  bogeys: number;
  doublesOrWorse: number;
};

// Anchor distributions per 18 holes, indexed by HI. Each row sums to 18.
// Pulled from published amateur scoring distributions (rounded to one decimal).
const ANCHORS: Array<[number, ExpectedDistribution]> = [
  [0, { birdiesOrBetter: 2.0, pars: 12.0, bogeys: 4.0, doublesOrWorse: 0.0 }],
  [5, { birdiesOrBetter: 1.5, pars: 9.5, bogeys: 6.0, doublesOrWorse: 1.0 }],
  [10, { birdiesOrBetter: 1.0, pars: 7.0, bogeys: 8.0, doublesOrWorse: 2.0 }],
  [15, { birdiesOrBetter: 0.7, pars: 5.0, bogeys: 9.0, doublesOrWorse: 3.3 }],
  [20, { birdiesOrBetter: 0.5, pars: 4.0, bogeys: 9.0, doublesOrWorse: 4.5 }],
  [25, { birdiesOrBetter: 0.4, pars: 3.0, bogeys: 8.5, doublesOrWorse: 6.1 }],
  [30, { birdiesOrBetter: 0.3, pars: 2.0, bogeys: 8.0, doublesOrWorse: 7.7 }],
  [36, { birdiesOrBetter: 0.2, pars: 1.5, bogeys: 7.0, doublesOrWorse: 9.3 }],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Expected per-18-hole counts of each score category for a given HI.
export function expectedDistribution(hcp: number): ExpectedDistribution {
  const last = ANCHORS.length - 1;
  if (hcp <= ANCHORS[0][0]) return { ...ANCHORS[0][1] };
  if (hcp >= ANCHORS[last][0]) return { ...ANCHORS[last][1] };
  for (let i = 0; i < last; i++) {
    const [h0, d0] = ANCHORS[i];
    const [h1, d1] = ANCHORS[i + 1];
    if (hcp >= h0 && hcp <= h1) {
      const t = (hcp - h0) / (h1 - h0);
      return {
        birdiesOrBetter: lerp(d0.birdiesOrBetter, d1.birdiesOrBetter, t),
        pars: lerp(d0.pars, d1.pars, t),
        bogeys: lerp(d0.bogeys, d1.bogeys, t),
        doublesOrWorse: lerp(d0.doublesOrWorse, d1.doublesOrWorse, t),
      };
    }
  }
  return { ...ANCHORS[0][1] };
}
