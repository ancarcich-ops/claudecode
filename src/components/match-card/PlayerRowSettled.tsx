// Player block for a SETTLED card. Identity + ordinal rank, dot row
// fully filled (no current / unplayed), and an Out/In summary chip.

"use client";

import Avatar from "@/components/Avatar";
import { isVariant } from "@/components/Avatar";
import HoleDotRow from "./HoleDotRow";
import type { PlayerCard } from "@/lib/matchCard";

export default function PlayerRowSettled({
  player,
  totalHoles,
  isWinner,
}: {
  player: PlayerCard;
  totalHoles: number;
  isWinner: boolean;
}) {
  const fmt = (n: number) =>
    n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
  const color = (n: number) =>
    n === 0 ? "text-mute" : n < 0 ? "text-accent" : "text-danger";

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className={
            "font-mono text-xs tabular-nums w-4 shrink-0 text-right " +
            (isWinner ? "text-gold" : "text-faint")
          }
        >
          {player.rank}
        </span>
        <div
          className="rounded-full ring-2 shrink-0"
          style={{
            boxShadow: `inset 0 0 0 2px ${isWinner ? "rgb(var(--color-gold))" : player.color}`,
          }}
        >
          <Avatar
            seed={player.avatar.seed ?? player.username ?? player.name}
            variant={
              player.avatar.variant && isVariant(player.avatar.variant)
                ? player.avatar.variant
                : undefined
            }
            avatarUrl={player.avatar.url ?? null}
            size={24}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className={
                "text-sm font-medium truncate " +
                (isWinner ? "text-gold" : "text-ink")
              }
            >
              {player.name}
            </span>
            <span className="font-mono text-[10px] text-mute shrink-0">
              hcp {player.handicap.toFixed(1).replace(/\.0$/, "")}
            </span>
          </div>
        </div>
        <span
          className={
            "font-mono tabular-nums text-sm " + color(player.netToPar)
          }
        >
          {fmt(player.netToPar)}
        </span>
      </div>

      <div className="mt-2">
        <HoleDotRow dots={player.dots} totalHoles={totalHoles} />
      </div>

      {totalHoles === 18 && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-panel2 border border-border px-2 py-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
            Out
          </span>
          <span
            className={"font-mono text-[10px] tabular-nums " + color(player.outNet)}
          >
            {fmt(player.outNet)}
          </span>
          <span className="text-faint text-[10px]">|</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
            In
          </span>
          <span
            className={"font-mono text-[10px] tabular-nums " + color(player.inNet)}
          >
            {fmt(player.inNet)}
          </span>
        </div>
      )}
    </div>
  );
}
