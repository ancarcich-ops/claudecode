// Hole-bucketed win-probability series for the odds graph. Extracted
// so the native match-detail chart is fed the exact same shape the web
// match page's OddsChart plots. Mirrors the web page's inline logic:
// build a per-timestamp row from the persisted odds snapshots, drop
// no-op repeats, append a trailing "now" point, then — once the round
// has started — bucket by how many holes have been logged so the line
// moves hole-by-hole instead of smearing across wall-clock gaps.

type PlayerLike = {
  id: string;
  team: number | null;
  scores: { hole: number; createdAt: Date }[];
};

type SnapshotLike = {
  matchPlayerId: string;
  probability: number;
  createdAt: Date;
};

export type OddsHoleRow = { hole: number } & Record<string, number>;

export type OddsSeriesResult = {
  // "hole" once any score exists, else "time" (pre-round build-up).
  xMode: "time" | "hole";
  // Hole-bucketed rows (present when xMode === "hole"). Each row is
  // { hole, [matchPlayerId]: probability 0..1 }.
  holeSeries: OddsHoleRow[] | null;
};

/**
 * @param players            match players (id, team, their score rows)
 * @param oddsSnapshots      persisted snapshots, any order
 * @param currentProbs       odds.probabilities (keyed by playerId, or
 *                           `team-0`/`team-1` for SCRAMBLE)
 * @param isScramble         format === "SCRAMBLE"
 */
export function buildOddsSeries(
  players: PlayerLike[],
  oddsSnapshots: SnapshotLike[],
  currentProbs: Record<string, number>,
  isScramble: boolean,
): OddsSeriesResult {
  type Row = { t: number } & Record<string, number>;

  const rowMap = new Map<number, Row>();
  for (const snap of oddsSnapshots) {
    const t = snap.createdAt.getTime();
    const row = rowMap.get(t) ?? ({ t } as Row);
    row[snap.matchPlayerId] = snap.probability;
    rowMap.set(t, row);
  }
  const allRows = Array.from(rowMap.values()).sort((a, b) => a.t - b.t);

  const probsEqual = (a: Row, b: Row) =>
    players.every((p) => Math.abs((a[p.id] ?? 0) - (b[p.id] ?? 0)) < 5e-4);

  const series: Row[] = [];
  for (const row of allRows) {
    if (series.length === 0 || !probsEqual(series[series.length - 1], row)) {
      series.push(row);
    }
  }

  const probabilityFor = (p: PlayerLike): number => {
    if (isScramble) {
      if (p.team !== 0 && p.team !== 1) return 0;
      return currentProbs[`team-${p.team}`] ?? 0;
    }
    return currentProbs[p.id] ?? 0;
  };
  if (series.length > 0) {
    const current: Row = { t: Number.MAX_SAFE_INTEGER } as Row;
    for (const p of players) current[p.id] = probabilityFor(p);
    if (!probsEqual(series[series.length - 1], current)) {
      series.push(current);
    }
  }

  // Round progress = distinct holes with at least one score, ranked by
  // when each hole was first logged.
  const earliestPerHole = new Map<number, number>();
  for (const p of players) {
    for (const s of p.scores) {
      const t = s.createdAt.getTime();
      const prev = earliestPerHole.get(s.hole);
      if (prev == null || t < prev) earliestPerHole.set(s.hole, t);
    }
  }
  const roundStarted = earliestPerHole.size > 0;
  if (!roundStarted) return { xMode: "time", holeSeries: null };

  const holeStartPairs = Array.from(earliestPerHole.entries()).sort(
    (a, b) => a[1] - b[1],
  );
  const holesPlayedAtTime = (t: number): number => {
    let count = 0;
    for (const [, startT] of holeStartPairs) if (startT <= t) count++;
    return count;
  };

  // Last snapshot per holes-played bucket wins (most recent odds).
  const byHole = new Map<number, Row>();
  for (const row of series) byHole.set(holesPlayedAtTime(row.t), row);
  const holeSeries = Array.from(byHole.keys())
    .sort((a, b) => a - b)
    .map((h) => {
      const row = byHole.get(h)!;
      const out: OddsHoleRow = { hole: h } as OddsHoleRow;
      for (const p of players) out[p.id] = row[p.id] ?? 0;
      return out;
    });

  return { xMode: "hole", holeSeries };
}
