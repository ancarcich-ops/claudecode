// Stable color palette for players in a match, indexed by seat.
export const PLAYER_COLORS = [
  "#34d399", // emerald
  "#60a5fa", // blue
  "#fbbf24", // amber
  "#f472b6", // pink
  "#a78bfa", // violet
  "#f87171", // red
];

export function colorForSeat(seat: number) {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length];
}
