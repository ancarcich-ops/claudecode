// Front 9 / Back 9 / Total gross-stroke chip rendered on the home-feed
// player rows. For 18-hole rounds it shows all three; for 9-hole rounds
// it just shows Total. Hidden entirely when nothing's been scored yet
// so upcoming rows don't pick up an empty pill. Partial nines show
// "Front 9 32 (8h)" so the running count is obvious.

import type { PlayerCard } from "@/lib/matchCard";

export default function ScoreSubtotalsChip({
  player,
  totalHoles,
}: {
  player: PlayerCard;
  totalHoles: number;
}) {
  if (player.holesPlayed === 0) return null;
  const showSplit = totalHoles === 18;

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-panel2 border border-border px-2 py-0.5">
      {showSplit && (
        <>
          <ChipPart
            label="Front 9"
            value={player.outGross}
            played={player.outHolesPlayed}
            of={9}
          />
          <span className="text-faint text-[10px]">·</span>
          <ChipPart
            label="Back 9"
            value={player.inGross}
            played={player.inHolesPlayed}
            of={9}
          />
          <span className="text-faint text-[10px]">·</span>
        </>
      )}
      <ChipPart
        label="Total"
        value={player.grossTotal}
        played={player.holesPlayed}
        of={totalHoles}
      />
    </span>
  );
}

function ChipPart({
  label,
  value,
  played,
  of,
}: {
  label: string;
  value: number;
  played: number;
  of: number;
}) {
  const complete = played === of;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
        {label}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-ink">
        {played > 0 ? value : "—"}
      </span>
      {!complete && played > 0 && (
        <span className="font-mono text-[9px] tabular-nums text-faint">
          ({played}h)
        </span>
      )}
    </span>
  );
}
