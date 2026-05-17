// Player block for an UPCOMING card. No scoring data yet, so the
// dot row is replaced with a seat-colored win-probability bar.

"use client";

import Avatar from "@/components/Avatar";
import { isVariant } from "@/components/Avatar";
import ProbabilityTick from "./ProbabilityTick";
import QuickWagerButton from "./QuickWagerButton";
import type { PlayerCard } from "@/lib/matchCard";

export default function PlayerRowUpcoming({
  player,
  matchId,
}: {
  player: PlayerCard;
  matchId: string;
}) {
  const pct = Math.max(0, Math.min(1, player.winProbability));
  return (
    <div className="py-2.5">
      <div className="flex items-center gap-2.5">
        <div
          className="rounded-full ring-2 shrink-0"
          style={{ boxShadow: `inset 0 0 0 2px ${player.color}` }}
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-ink truncate">
              {player.name}
            </span>
            <span className="font-mono text-[10px] text-mute shrink-0">
              hcp {player.handicap.toFixed(1).replace(/\.0$/, "")}
            </span>
            <QuickWagerButton
              matchId={matchId}
              pickedPlayerId={player.id}
              playerName={player.name}
              isMyPick={player.isMyPick}
            />
          </div>
        </div>
        <ProbabilityTick
          playerId={player.id}
          probability={player.winProbability}
        />
      </div>
      <div className="mt-2 h-1 rounded-full bg-border/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${pct * 100}%`,
            background: player.color,
          }}
        />
      </div>
    </div>
  );
}
