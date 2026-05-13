"use client";

import { useTransition } from "react";
import { logScoreAction } from "@/lib/actions";

type Player = {
  id: string;
  displayName: string;
  color: string;
  handicap: number;
  scores: { hole: number; strokes: number }[];
};

export default function ScoreSheet({
  matchId,
  holes,
  players,
  locked,
}: {
  matchId: string;
  holes: number;
  players: Player[];
  locked: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const holeNumbers = Array.from({ length: holes }, (_, i) => i + 1);

  const totals = players.map((p) => ({
    id: p.id,
    total: p.scores.reduce((s, e) => s + e.strokes, 0),
    holesPlayed: p.scores.length,
    net: p.scores.reduce((s, e) => s + e.strokes, 0) - p.handicap,
  }));

  const submit = (matchPlayerId: string, hole: number, strokes: string) => {
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("matchPlayerId", matchPlayerId);
    fd.set("hole", String(hole));
    fd.set("strokes", strokes);
    startTransition(() => {
      logScoreAction(fd);
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="text-mute">
            <th className="text-left font-normal text-xs uppercase tracking-wider px-2 py-2 sticky left-0 bg-panel z-10">
              Hole
            </th>
            {holeNumbers.map((h) => (
              <th
                key={h}
                className="font-mono text-xs px-1 py-2 text-center min-w-[2.25rem]"
              >
                {h}
              </th>
            ))}
            <th className="font-mono text-xs px-2 py-2 text-right">Gross</th>
            <th className="font-mono text-xs px-2 py-2 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const byHole = new Map(p.scores.map((s) => [s.hole, s.strokes]));
            const t = totals.find((x) => x.id === p.id)!;
            return (
              <tr key={p.id} className="border-t border-border">
                <td className="px-2 py-1.5 sticky left-0 bg-panel z-10">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="truncate max-w-[8rem]">
                      {p.displayName}
                    </span>
                  </div>
                </td>
                {holeNumbers.map((h) => {
                  const val = byHole.get(h);
                  return (
                    <td key={h} className="p-0.5 text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={20}
                        defaultValue={val ?? ""}
                        disabled={locked || pending}
                        onBlur={(e) => {
                          const next = e.target.value;
                          const prev = val === undefined ? "" : String(val);
                          if (next !== prev) submit(p.id, h, next);
                        }}
                        className="w-9 h-9 rounded-md bg-panel2 border border-border text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {t.total || "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-accent">
                  {t.holesPlayed > 0 ? t.net.toFixed(1) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-mute mt-3">
        Tab through cells to log strokes. The market reprices after each entry.
      </p>
    </div>
  );
}
