// Marquee items for the LIVE/UPCOMING home-card header ticker, computed
// server-side so the native app can render the strip verbatim. Mirrors
// buildTickerItems in src/lib/matchCard.ts (keep the two in sync):
// leads with the line (top-3 win %), then the leader's score, wager
// count, and a ready-to-start nudge.

import { strokesGivenForHole } from "./netScoring";

export type TickerPlayerInput = {
  name: string;
  winProbability: number; // 0..1; 0 for all when odds aren't priced
  handicap: number;
  scoresByHole: Record<number, number>;
};

export function buildMatchTickerItems(input: {
  players: TickerPlayerInput[];
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  holes: number;
  startingHole: number;
  pars: number[];
  scoringMode: "NET" | "GROSS" | "CUSTOM";
  totalWagers: number;
}): string[] {
  const { players, status, holes, startingHole, pars, scoringMode, totalWagers } =
    input;
  const isSolo = players.length === 1;
  const hasOdds = players.some((p) => p.winProbability > 0);

  // Per-player to-par (net, unless a gross round) + holes played.
  const summaries = players.map((p) => {
    let toPar = 0;
    let played = 0;
    for (let i = 0; i < holes; i++) {
      const gross = p.scoresByHole[startingHole + i];
      if (gross == null) continue;
      played++;
      const par = pars[i] ?? 4;
      const net =
        scoringMode === "GROSS"
          ? gross
          : gross - strokesGivenForHole(p.handicap, i, holes);
      toPar += net - par;
    }
    return { name: p.name, winProbability: p.winProbability, toPar, played };
  });

  const items: string[] = [];
  const sorted = [...summaries].sort(
    (a, b) => b.winProbability - a.winProbability,
  );

  // Lead with the line -- only when odds are actually priced (skip solo /
  // scramble, which report no probabilities).
  if (!isSolo && hasOdds) {
    for (const p of sorted.slice(0, 3)) {
      items.push(`${p.name.toUpperCase()} ${Math.round(p.winProbability * 100)}%`);
    }
  }

  if (status === "IN_PROGRESS") {
    const leader = sorted[0];
    if (leader && leader.played > 0) {
      const npar =
        leader.toPar === 0
          ? "E"
          : `${leader.toPar > 0 ? "+" : ""}${leader.toPar}`;
      items.push(`${isSolo ? "SCORE" : "LEADER"} ${npar} THRU ${leader.played}`);
    }
  }

  if (totalWagers > 0) {
    items.push(`${totalWagers} WAGER${totalWagers === 1 ? "" : "S"}`);
  }

  if (!isSolo && status === "UPCOMING") {
    items.push("READY TO START");
  }

  return items;
}
