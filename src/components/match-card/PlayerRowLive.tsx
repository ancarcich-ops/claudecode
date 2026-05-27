// One player block inside a LIVE card. Identity row (avatar + name +
// hcp + tick) sits on top, the Out/In dot row below it, and a small
// chip showing "thru N · +Y" at the bottom.

"use client";

import Avatar from "@/components/Avatar";
import { isVariant } from "@/components/Avatar";
import ProbabilityTick, { useRowFlash } from "./ProbabilityTick";
import HoleDotRow from "./HoleDotRow";
import MomentumChip from "./MomentumChip";
import QuickWagerButton from "./QuickWagerButton";
import Sparkline from "./Sparkline";
import type { PlayerCard } from "@/lib/matchCard";

export default function PlayerRowLive({
  player,
  totalHoles,
  matchId,
}: {
  player: PlayerCard;
  totalHoles: number;
  matchId: string;
}) {
  const flashCls = useRowFlash(player.id, player.winProbability);
  const netLabel =
    player.netToPar === 0
      ? "E"
      : player.netToPar > 0
        ? `+${player.netToPar}`
        : `${player.netToPar}`;
  const netColor =
    player.netToPar < 0
      ? "text-accent"
      : player.netToPar > 0
        ? "text-danger"
        : "text-mute";

  return (
    <div className={"py-2.5 px-1 -mx-1 rounded-md " + flashCls}>
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

      <div className="mt-2">
        <HoleDotRow dots={player.dots} totalHoles={totalHoles} />
      </div>

      {player.holesPlayed > 0 && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-panel2 border border-border px-2 py-0.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
              thru {player.holesPlayed} of {totalHoles}
            </span>
            <span
              className={"font-mono text-[10px] tabular-nums " + netColor}
            >
              {netLabel}
            </span>
          </span>
          {player.momentum && <MomentumChip m={player.momentum} />}
        </div>
      )}
    </div>
  );
}
