"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMatchInPlaceAction } from "@/lib/actions";

type RoundItem = {
  matchId: string;
  courseName: string;
  scheduledAt: string; // ISO so we can serialize from the server cleanly
  holesPlayed: number;
  vsPar: number;
};

// Shows every logged round with a small delete-X. Two-tap confirm pattern
// to avoid accidental deletions on mobile -- first tap arms the X (turns
// red), second tap actually fires the action.
export default function RoundsList({ rounds }: { rounds: RoundItem[] }) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = rounds.filter((r) => !hidden.has(r.matchId));

  const remove = (matchId: string, label: string) => {
    if (armed !== matchId) {
      setArmed(matchId);
      // Auto-disarm after a few seconds so the chip doesn't sit hot forever.
      setTimeout(() => {
        setArmed((cur) => (cur === matchId ? null : cur));
      }, 3000);
      return;
    }
    setArmed(null);
    setHidden((s) => new Set(s).add(matchId));
    startTransition(async () => {
      try {
        await deleteMatchInPlaceAction(matchId);
        toast.success(`Removed ${label}.`);
      } catch (e) {
        // Restore the row if the delete failed.
        setHidden((s) => {
          const next = new Set(s);
          next.delete(matchId);
          return next;
        });
        const msg = e instanceof Error ? e.message : "Delete failed.";
        toast.error(msg);
      }
    });
  };

  if (visible.length === 0) {
    return (
      <p className="text-[11px] text-mute">No logged rounds.</p>
    );
  }

  return (
    <ul className="space-y-1">
      {visible.map((r) => {
        const d = new Date(r.scheduledAt);
        const dateStr = d.toLocaleDateString(undefined, {
          month: "numeric",
          day: "numeric",
          year: "2-digit",
        });
        const isArmed = armed === r.matchId;
        const sign = r.vsPar > 0 ? "+" : "";
        const vsClass =
          r.vsPar < 0
            ? "text-accent"
            : r.vsPar === 0
              ? "text-gold"
              : "text-mute";
        const label = `${r.courseName} on ${dateStr}`;
        return (
          <li
            key={r.matchId}
            className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">{r.courseName}</div>
              <div className="text-[10px] text-mute font-mono tabular-nums">
                {dateStr} · {r.holesPlayed} hole
                {r.holesPlayed === 1 ? "" : "s"}
              </div>
            </div>
            <div className="font-mono tabular-nums shrink-0 text-right">
              <span className={vsClass}>
                {sign}
                {r.vsPar === 0 ? "E" : r.vsPar}
              </span>
            </div>
            <button
              type="button"
              onClick={() => remove(r.matchId, label)}
              disabled={pending}
              aria-label={
                isArmed
                  ? `Confirm delete ${label}`
                  : `Delete ${label}`
              }
              className={
                "shrink-0 w-8 h-8 rounded-md text-sm font-mono font-semibold transition-colors border " +
                (isArmed
                  ? "bg-danger text-black border-danger"
                  : "bg-danger/10 text-danger border-danger/40 hover:bg-danger/20")
              }
              title={isArmed ? "Tap again to confirm" : "Delete round"}
            >
              {isArmed ? "✓" : "×"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
