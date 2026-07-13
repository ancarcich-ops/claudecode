"use client";

// Tap-to-expand "how your index is calculated" panel under the Sticks
// Index hero. Shows each round's differential, which ones counted as the
// "best N", and the final average -> adjust -> x0.96 math -- the same
// numbers handicapBreakdown() feeds the index itself.

import { useState } from "react";
import type { HandicapBreakdown } from "@/lib/handicap";

export default function HandicapExplainer({
  breakdown,
}: {
  breakdown: HandicapBreakdown;
}) {
  const [open, setOpen] = useState(false);
  const b = breakdown;
  const fmt = (n: number) => (n >= 0 ? n.toFixed(1) : n.toFixed(1));

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"
        aria-expanded={open}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={"transition-transform " + (open ? "rotate-90" : "")}
          aria-hidden
        >
          <path d="M4.5 2.5l4 4-4 4" />
        </svg>
        How is this calculated?
      </button>

      {open && (
        <div className="mt-2 card p-4 space-y-3">
          <p className="text-[12px] text-mute leading-snug">
            Your index uses the{" "}
            <span className="text-ink font-medium">best {b.usedCount}</span> of
            your last {b.fromRounds} round{b.fromRounds === 1 ? "" : "s"}. Each
            round becomes a <span className="text-ink font-medium">
              differential
            </span>{" "}
            &mdash; how far over the course&apos;s difficulty you scored,{" "}
            <span className="font-mono text-[11px]">
              (113 ÷ slope) × (gross − rating)
            </span>
            . Only your lowest {b.usedCount} count.
          </p>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] min-w-[320px]">
              <thead>
                <tr className="text-faint text-[10px] uppercase tracking-wider">
                  <th className="text-left font-medium py-1 pl-1">Round</th>
                  <th className="text-right font-medium py-1">Score</th>
                  <th className="text-right font-medium py-1 pr-1">Diff</th>
                </tr>
              </thead>
              <tbody>
                {[...b.perRound]
                  .sort((a, c) => a.differential - c.differential)
                  .map((r, i) => (
                    <tr
                      key={`${r.matchId}-${i}`}
                      className={
                        "border-t border-borderSoft " +
                        (r.used ? "" : "opacity-45")
                      }
                    >
                      <td className="py-1.5 pl-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {r.used && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full bg-accent shrink-0"
                              title="Counts toward your index"
                            />
                          )}
                          <span className="truncate text-ink">
                            {r.courseName}
                          </span>
                          {r.method === "score-only" && (
                            <span
                              className="font-mono text-[9px] text-faint shrink-0"
                              title="No course rating/slope on file — estimated from score vs par"
                            >
                              est
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-mute">
                        {r.gross}
                        <span className="text-faint">
                          {" "}
                          ({r.vsPar >= 0 ? `+${r.vsPar}` : r.vsPar})
                        </span>
                      </td>
                      <td
                        className={
                          "py-1.5 pr-1 text-right tabular-nums font-medium " +
                          (r.used ? "text-ink" : "text-mute")
                        }
                      >
                        {fmt(r.differential)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md bg-panel2/50 p-2.5 font-mono text-[11px] text-mute space-y-0.5">
            <div>
              avg of best {b.usedCount} ={" "}
              <span className="text-ink">{b.average.toFixed(2)}</span>
            </div>
            {b.adjust !== 0 && (
              <div>
                − {b.adjust.toFixed(1)} (small-sample adjustment for{" "}
                {b.fromRounds} rounds)
              </div>
            )}
            <div>× 0.96 (bonus of excellence)</div>
            <div className="text-ink pt-0.5 border-t border-borderSoft mt-1">
              = index{" "}
              <span className="font-semibold">{b.index.toFixed(1)}</span>
            </div>
          </div>

          {b.fromRounds >= 3 && b.fromRounds <= 8 && (
            <p className="text-[11px] text-faint leading-snug">
              With fewer than ~20 rounds, only a handful count — your index
              swings more per round and firms up as you log more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
