"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSideGameEventAction } from "@/lib/actions";

type Player = { id: string; displayName: string };
// Pre-shaped: threePuttsByHole[hole] = Set of matchPlayerIds who 3-putted
type ThreePuttsByHole = Record<number, Set<string>>;

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
    <div className="space-y-1.5">
      {Array.from({ length: holes }, (_, i) => startingHole + i).map((h) => {
        const tagged = threePuttsByHole[h] ?? new Set<string>();
        return (
          <div
            key={h}
            className="flex items-center gap-2 border-t border-border pt-1.5 first:border-t-0 first:pt-0"
          >
            <div className="w-8 shrink-0 text-xs font-mono tabular-nums text-mute text-right">
              {h}
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
                      "text-xs px-2 py-1 rounded-full border transition-colors whitespace-nowrap " +
                      (on
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : "border-border text-mute hover:text-ink")
                    }
                    title={
                      on
                        ? `Clear 3-putt for ${p.displayName} on hole ${h}`
                        : `Mark 3-putt for ${p.displayName} on hole ${h}`
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
    </div>
  );
}
