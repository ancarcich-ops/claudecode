"use client";

import { useState, useTransition } from "react";
import { createTournamentTeamAction } from "@/lib/actions";

type Player = {
  id: string;
  displayName: string;
  handicap: number | null;
  partnerName: string | null;
};

// Manual 2-man pairing: tap two unassigned players, then "Make team".
// Each row shows the player's stated partner preference so the organizer
// can pair by preference.
export default function TeamBuilder({ unassigned }: { unassigned: Player[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length < 2
          ? [...s, id]
          : s,
    );

  const make = () => {
    if (selected.length !== 2) return;
    const fd = new FormData();
    fd.set("playerId1", selected[0]);
    fd.set("playerId2", selected[1]);
    start(async () => {
      await createTournamentTeamAction(fd);
      setSelected([]);
    });
  };

  if (unassigned.length === 0) {
    return (
      <p className="text-sm text-mute">
        Everyone&rsquo;s on a team. 🎉
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[12px] text-mute">
          Tap two players to pair them.
        </span>
        <button
          type="button"
          disabled={selected.length !== 2 || pending}
          onClick={make}
          className="btn btn-primary text-xs disabled:opacity-40"
        >
          {pending ? "Pairing…" : `Make team (${selected.length}/2)`}
        </button>
      </div>
      <div className="space-y-1">
        {unassigned.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={
                "w-full flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors " +
                (on
                  ? "border-accent bg-accent/10"
                  : "border-border bg-panel2 hover:border-accent/40")
              }
            >
              <span className="min-w-0">
                <span className="font-medium text-ink">{p.displayName}</span>
                {p.partnerName && (
                  <span className="block text-[12px] text-mute truncate">
                    wants: {p.partnerName}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-mute">
                {p.handicap != null ? `HCP ${p.handicap.toFixed(1)}` : "HCP —"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
