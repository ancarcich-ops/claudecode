// Small badge next to the thru chip when a player has done something
// noteworthy in their recent holes. Priority + thresholds are defined
// by momentumFor() in lib/matchCard.ts:
//
//   eagle  (most recent hole was an eagle)        -> gold
//   hot    (>=3 birdies in the round so far)      -> accent, flame flicker
//   birdie (most recent hole was a birdie)        -> accent
//   cold   (>=+4 over par across the last 3)      -> danger
//
// One chip per player.

import type { Momentum } from "@/lib/matchCard";

export default function MomentumChip({ m }: { m: Momentum }) {
  if (m.kind === "eagle") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 border border-gold/30 px-2 py-0.5">
        <span aria-hidden>🦅</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-gold">
          Eagle on {m.hole}
        </span>
      </span>
    );
  }
  if (m.kind === "hot") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/30 px-2 py-0.5">
        <span aria-hidden className="flicker">🔥</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
          {m.birdies} birdies
        </span>
      </span>
    );
  }
  if (m.kind === "birdie") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/30 px-2 py-0.5">
        <span aria-hidden>🐥</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
          Birdie on {m.hole}
        </span>
      </span>
    );
  }
  // cold
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 border border-danger/30 px-2 py-0.5">
      <span aria-hidden>❄️</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-danger">
        +{m.over} · last {m.lastN}
      </span>
    </span>
  );
}
