"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSideGameEventAction } from "@/lib/actions";

// Per-hole Press toggle. Each cell is a tap target -- on creates a press
// for that hole, off removes it. Manual presses spawn a fresh match-play
// line starting on hole+1, so the editor disables the final hole (no
// future holes for the line to play out).
export default function PressEditor({
  sideGameId,
  holes,
  startingHole = 1,
  pressedHoles,
  locked,
}: {
  sideGameId: string;
  holes: number;
  startingHole?: number;
  pressedHoles: Set<number>;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = (hole: number) => {
    const fd = new FormData();
    fd.set("sideGameId", sideGameId);
    fd.set("hole", String(hole));
    fd.set("kind", "PRESS");
    startTransition(async () => {
      await recordSideGameEventAction(fd);
      router.refresh();
    });
  };

  const lastHole = startingHole + holes - 1;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
        {Array.from({ length: holes }, (_, i) => startingHole + i).map((h) => {
          const isLast = h === lastHole;
          const on = pressedHoles.has(h);
          return (
            <button
              key={h}
              type="button"
              onClick={() => !isLast && toggle(h)}
              disabled={pending || locked || isLast}
              aria-pressed={on}
              title={
                isLast
                  ? "Can't press on the final hole"
                  : on
                    ? `Clear press at hole ${h}`
                    : `Press at hole ${h}`
              }
              className={
                "h-10 rounded-md border text-xs font-mono tabular-nums transition-colors " +
                (isLast
                  ? "border-border text-mute opacity-40 cursor-not-allowed"
                  : on
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-panel text-mute hover:text-ink")
              }
            >
              {h}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-mute">
        Tap a hole to press from the next hole forward; tap again to clear.
      </p>
    </div>
  );
}
