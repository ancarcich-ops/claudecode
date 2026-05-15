// Stable color palette for players in a match, indexed by seat. Per the
// brand kit's seat palette: each color reads distinctly on the dark
// surface even at 2px stroke on the odds chart, and avoids the brand's
// semantic colors (gold = even par, danger red, etc) where possible.
//
//  Seat 1 · Emerald  -- always 'you'; brand-loaded "you're the line"
//  Seat 2 · Sky      -- strongest divergence from emerald on dark
//  Seat 3 · Gold     -- doubles as the leader/par color
//  Seat 4 · Ember    -- distinct hue; no other system color sits here
//  Seat 5 · Cyan     -- cool counter to ember, clean at 2px
//  Seat 6 · Rose     -- mixed-group guardrail; reads at small sizes
export const PLAYER_COLORS = [
  "#34d399", // emerald
  "#60a5fa", // sky
  "#fbbf24", // gold
  "#fb923c", // ember
  "#22d3ee", // cyan
  "#f472b6", // rose
];

export function colorForSeat(seat: number) {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length];
}
