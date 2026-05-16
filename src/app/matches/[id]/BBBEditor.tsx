"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSideGameEventAction } from "@/lib/actions";

type Player = { id: string; displayName: string };
type EventKind = "BINGO" | "BANGO" | "BONGO";
type EventsByHole = Record<number, Partial<Record<EventKind, string | null>>>;

const COLUMNS: { kind: EventKind; label: string; hint: string }[] = [
  { kind: "BINGO", label: "Bingo", hint: "first on the green" },
  { kind: "BANGO", label: "Bango", hint: "closest once on" },
  { kind: "BONGO", label: "Bongo", hint: "first in the hole" },
];

// Per-hole BBB editor. Each hole gets a small card with three labeled
// rows (Bingo / Bango / Bongo) and a button-strip of players to assign
// the point to. Tap once to award, tap the active player again to clear.
// Much more touch-friendly than the old dense table of selects.
export default function BBBEditor({
  sideGameId,
  holes,
  startingHole = 1,
  players,
  events,
  locked,
}: {
  sideGameId: string;
  holes: number;
  startingHole?: number;
  players: Player[];
  events: EventsByHole;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const setEvent = (hole: number, kind: EventKind, playerId: string) => {
    const fd = new FormData();
    fd.set("sideGameId", sideGameId);
    fd.set("hole", String(hole));
    fd.set("kind", kind);
    fd.set("matchPlayerId", playerId);
    startTransition(async () => {
      await recordSideGameEventAction(fd);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {Array.from({ length: holes }, (_, i) => startingHole + i).map((h) => {
        const holeEvents = events[h] ?? {};
        return (
          <div
            key={h}
            className="rounded-md border border-border bg-panel2 px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <div className="font-mono tabular-nums text-mute text-xs">
                Hole {h}
              </div>
              <div className="text-[10px] text-mute">
                {Object.values(holeEvents).filter(Boolean).length}/3 awarded
              </div>
            </div>
            <div className="space-y-1.5">
              {COLUMNS.map((c) => {
                const current = holeEvents[c.kind] ?? "";
                return (
                  <div
                    key={c.kind}
                    className="grid grid-cols-[5rem_1fr] items-center gap-2"
                  >
                    <div>
                      <div className="text-xs font-medium text-ink leading-tight">
                        {c.label}
                      </div>
                      <div className="text-[10px] text-mute leading-tight">
                        {c.hint}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {players.map((p) => {
                        const active = current === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              setEvent(h, c.kind, active ? "" : p.id)
                            }
                            disabled={pending || locked}
                            aria-pressed={active}
                            className={
                              "text-xs px-2.5 py-1.5 rounded-full border transition-colors whitespace-nowrap " +
                              (active
                                ? "border-accent bg-accent/10 text-ink"
                                : "border-border bg-panel text-mute hover:text-ink")
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
          </div>
        );
      })}
      <p className="text-[11px] text-mute pt-1">
        Tap a player to award the point; tap them again to clear it.
      </p>
    </div>
  );
}
