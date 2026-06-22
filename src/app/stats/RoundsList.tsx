"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMatchInPlaceAction } from "@/lib/actions";

type RoundItem = {
  matchId: string;
  courseName: string;
  scheduledAt: string; // ISO so we can serialize from the server cleanly
  holesPlayed: number;
  vsPar: number;
};

// Each round row exposes two actions:
//   - Edit  -> opens the match detail page where the creator can
//              tweak scores, reopen the match if completed, or
//              change side-game configuration.
//   - Delete -> opens an inline confirm strip (Cancel / Delete
//              forever) so a stray tap can't wipe a round. Auto-
//              dismisses after 6s of inactivity.
export default function RoundsList({ rounds }: { rounds: RoundItem[] }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Auto-dismiss the open confirm strip after 6s so it doesn't sit
  // armed forever if the user wanders away.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(null), 6000);
    return () => clearTimeout(t);
  }, [confirming]);

  const visible = rounds.filter((r) => !hidden.has(r.matchId));

  const confirmDelete = (matchId: string, label: string) => {
    setConfirming(null);
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
    return <p className="text-[11px] text-mute">No logged rounds.</p>;
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
        const isConfirming = confirming === r.matchId;
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
            {isConfirming ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={pending}
                  className="h-8 px-2 rounded-md text-[11px] font-medium border border-border bg-panel2 text-mute hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete(r.matchId, label)}
                  disabled={pending}
                  className="h-8 px-2 rounded-md text-[11px] font-semibold bg-danger text-white hover:bg-danger/85"
                >
                  Delete
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href={`/matches/${r.matchId}`}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-mute hover:text-ink hover:bg-panel2 border border-border"
                  aria-label={`Edit ${label}`}
                  title="Edit round"
                >
                  <PencilIcon />
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirming(r.matchId)}
                  disabled={pending}
                  aria-label={`Delete ${label}`}
                  title="Delete round"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-danger border border-danger/40 bg-danger/10 hover:bg-danger/20"
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
