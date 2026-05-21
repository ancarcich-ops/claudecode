"use client";

import { useEffect, useRef, useTransition } from "react";
import { logScoreAction } from "@/lib/actions";

type Player = {
  id: string;
  displayName: string;
  color: string;
  handicap: number;
  scores: { hole: number; strokes: number }[];
};

export default function Scorecard({
  matchId,
  holes,
  startingHole = 1,
  pars,
  players,
  locked,
}: {
  matchId: string;
  holes: number;
  // First hole played (1 for full/front-9, 10 for back-9). Hole labels are
  // absolute; pars is still length=holes indexed from startingHole.
  startingHole?: number;
  pars: number[];
  players: Player[];
  locked: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const holeNumbers = Array.from(
    { length: holes },
    (_, i) => startingHole + i,
  );
  const coursePar = pars.reduce((a, b) => a + b, 0);

  // Compute the next hole (first one nobody has logged yet) and scroll
  // it into view on mount. We keep the previous played hole visible too
  // so the user has context for the running score.
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextHoleCellRef = useRef<HTMLTableCellElement>(null);
  const maxScored = players.reduce(
    (m, p) =>
      Math.max(m, p.scores.reduce((mm, s) => Math.max(mm, s.hole), 0)),
    0,
  );
  const lastHole = startingHole + holes - 1;
  const nextHoleNum = Math.min(Math.max(maxScored + 1, startingHole), lastHole);

  useEffect(() => {
    // Nothing logged yet -> leave the scroll at the start so hole 1 is
    // already in view.
    if (maxScored === 0) return;
    const cell = nextHoleCellRef.current;
    const container = scrollRef.current;
    if (!cell || !container) return;
    // Show one hole of "what just happened" before the next hole. The
    // sticky-left player-name column is ~128px and each hole cell is
    // ~40px wide, so we land the next column ~168px from the left edge.
    const target = cell.offsetLeft - 168;
    container.scrollLeft = Math.max(0, target);
  }, [maxScored]);

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
    <div ref={scrollRef} className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="text-mute">
            <th className="text-left font-normal text-xs uppercase tracking-wider px-2 py-2 sticky left-0 bg-panel z-10 min-w-[8rem]">
              Hole
            </th>
            {holeNumbers.map((h) => (
              <th
                key={h}
                ref={h === nextHoleNum ? nextHoleCellRef : undefined}
                className={
                  "font-mono text-xs px-1 py-2 text-center min-w-[2.5rem] " +
                  (h === nextHoleNum && maxScored > 0 ? "text-accent" : "")
                }
              >
                {h}
              </th>
            ))}
            <th className="font-mono text-xs px-2 py-2 text-right min-w-[3rem]">
              Gross
            </th>
            <th className="font-mono text-xs px-2 py-2 text-right min-w-[3rem]">
              Net
            </th>
          </tr>
          <tr className="text-mute/70">
            <th className="text-left font-normal text-[10px] uppercase tracking-wider px-2 pb-2 sticky left-0 bg-panel z-10">
              Par
            </th>
            {pars.map((p, i) => (
              <th
                key={i}
                className="font-mono text-[10px] px-1 pb-2 text-center"
              >
                {p}
              </th>
            ))}
            <th className="font-mono text-[10px] px-2 pb-2 text-right">
              {coursePar}
            </th>
            <th className="font-mono text-[10px] px-2 pb-2 text-right">—</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const byHole = new Map(p.scores.map((s) => [s.hole, s.strokes]));
            const total = p.scores.reduce((s, e) => s + e.strokes, 0);
            const net = total - p.handicap;
            return (
              <tr key={p.id} className="border-t border-border">
                <td className="px-2 py-1.5 sticky left-0 bg-panel z-10">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: p.color }}
                    />
                    <span className="truncate max-w-[7rem]">
                      {p.displayName}
                    </span>
                  </div>
                </td>
                {holeNumbers.map((h) => {
                  const val = byHole.get(h);
                  const parH = pars[h - startingHole] ?? 4;
                  const cls =
                    val === undefined
                      ? ""
                      : val < parH
                        ? "text-accent"
                        : val > parH
                          ? "text-danger"
                          : "text-ink";
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            (e.target as HTMLInputElement).blur();
                        }}
                        className={`w-10 h-10 sm:w-9 sm:h-9 rounded-md bg-panel2 border border-border text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-accent ${cls}`}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {total || "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-accent">
                  {p.scores.length > 0 ? net.toFixed(1) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-mute mt-3 px-1">
        Tap a cell to log strokes. Green = under par, red = over.{" "}
        The market reprices after each entry — friends watching see the chart
        move in seconds.
      </p>
    </div>
  );
}
