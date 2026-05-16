"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSideGameEventAction } from "@/lib/actions";

type Player = { id: string; displayName: string };
// Pre-shaped: threePuttsByHole[hole] = Set of matchPlayerIds who 3-putted
type ThreePuttsByHole = Record<number, Set<string>>;

// Per-hole 3-putt tracker. Each hole gets its own card with a strip of
// player chips. Tap a chip to toggle the 3-putt on that hole. Bigger,
// more touch-friendly than the old dense list.
export default function SnakeEditor({
  sideGameId,
  holes,
  startingHole = 1,
  players,
  threePuttsByHole,
  locked,
}: {
  sideGameId: string;
  holes: number;
  startingHole?: number;
  players: Player[];
  threePuttsByHole: ThreePuttsByHole;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = (hole: number, playerId: string) => {
    const fd = new FormData();
    fd.set("sideGameId", sideGameId);
    fd.set("hole", String(hole));
    fd.set("kind", "THREE_PUTT");
    fd.set("matchPlayerId", playerId);
    startTransition(async () => {
      await recordSideGameEventAction(fd);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {Array.from({ length: holes }, (_, i) => startingHole + i).map((h) => {
        const tagged = threePuttsByHole[h] ?? new Set<string>();
        return (
          <div
            key={h}
            className="rounded-md border border-border bg-panel2 px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <div className="font-mono tabular-nums text-mute text-xs">
                Hole {h}
              </div>
              {tagged.size > 0 && (
                <div className="text-[10px] text-danger uppercase tracking-wider">
                  {tagged.size} 3-putt{tagged.size === 1 ? "" : "s"}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {players.map((p) => {
                const on = tagged.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(h, p.id)}
                    disabled={pending || locked}
                    aria-pressed={on}
                    className={
                      "text-xs px-2.5 py-1.5 rounded-full border transition-colors whitespace-nowrap " +
                      (on
                        ? "border-danger/50 bg-danger/15 text-danger"
                        : "border-border bg-panel text-mute hover:text-ink")
                    }
                    title={
                      on
                        ? `Clear 3-putt for ${p.displayName}`
                        : `Mark 3-putt for ${p.displayName}`
                    }
                  >
                    {p.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-mute pt-1">
        Tap a player to mark a 3-putt on that hole; tap again to clear.
      </p>
    </div>
  );
}
