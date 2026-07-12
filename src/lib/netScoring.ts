// Per-hole handicap-stroke allocation, shared so the scorecard's Net
// view agrees to the stroke with the scoring engine (skins/standings).
//
// This mirrors `strokesGiven` in src/lib/sideGames.ts EXACTLY: strokes
// are NOT allocated by course stroke index -- the engine spreads them
// evenly (floor(hcp/holes) each) and drops the remainder on the opening
// holes of the round. Keep the two in sync; the native app replicates
// the same formula.

/**
 * Strokes received on the hole at 0-based round position `holeIndex0`
 * (0 = the round's first hole, regardless of the starting hole number).
 */
export function strokesGivenForHole(
  handicap: number,
  holeIndex0: number,
  totalHoles: number,
): number {
  if (handicap <= 0 || totalHoles <= 0) return 0;
  const base = Math.floor(handicap / totalHoles);
  const extra = handicap - base * totalHoles;
  return base + (holeIndex0 < extra ? 1 : 0);
}
