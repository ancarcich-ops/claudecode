"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
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
  const [, startTransition] = useTransition();
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
  // Captures the FIRST hole cell so we can measure where the sticky
  // team/player column ends -- its offsetLeft is the sticky column's
  // rendered width, which varies between INDIVIDUAL (player names,
  // ~128px) and SCRAMBLE (team labels, ~160-200px).
  const firstHoleCellRef = useRef<HTMLTableCellElement>(null);
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
    // Position the next-to-play hole one full hole-width AFTER the
    // sticky column so the just-played hole is also fully visible.
    // firstHoleCellRef.offsetLeft = where the first hole cell starts =
    // sticky column's rendered width. Falling back to 168 if the ref
    // hasn't attached yet (rare; only during hot-reload jitter).
    const stickyEnd = firstHoleCellRef.current?.offsetLeft ?? 128;
    const holeCellWidth = cell.offsetWidth || 40;
    // Subtract stickyEnd + holeCellWidth so the prev hole lands just
    // after the sticky column; subtract an extra ~8px gutter so the
    // prev-hole cell isn't kissing the sticky-column border.
    const target = cell.offsetLeft - stickyEnd - holeCellWidth - 8;
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

  // Refs for every score cell in column-major order so we can advance
  // focus to the NEXT player on the SAME hole (then jump to the first
  // player of the next hole when the column is full). Keyed by
  // `${playerIdx}:${holeIdx}` for cheap lookup.
  const inputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const focusNext = (playerIdx: number, holeIdx: number) => {
    let nextPlayer = playerIdx + 1;
    let nextHole = holeIdx;
    if (nextPlayer >= players.length) {
      nextPlayer = 0;
      nextHole = holeIdx + 1;
    }
    if (nextHole >= holes) return;
    const el = inputRefs.current.get(`${nextPlayer}:${nextHole}`);
    el?.focus();
    el?.select();
  };

  // Debounce timers per cell. We commit + advance ~400ms after the
  // user's last keystroke so double-digit scores (10, 11, etc.) still
  // work without each digit firing its own server round-trip.
  const commitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const scheduleCommit = (
    key: string,
    matchPlayerId: string,
    hole: number,
    playerIdx: number,
    holeIdx: number,
    rawValue: string,
    priorValue: number | undefined,
  ) => {
    const existing = commitTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      commitTimers.current.delete(key);
      const trimmed = rawValue.trim();
      const prev = priorValue === undefined ? "" : String(priorValue);
      // Only fire the server action when the value actually changed.
      // Submitting "" clears the score (logScoreAction handles that).
      if (trimmed !== prev) submit(matchPlayerId, hole, trimmed);
      // Always advance focus once the user has paused -- even if they
      // re-typed the same number, the assumption is "I'm done here,
      // next person."
      focusNext(playerIdx, holeIdx);
    }, 400);
    commitTimers.current.set(key, t);
  };

  // Memoize player index lookup so it doesn't change identity each render.
  const playerIndexById = useMemo(() => {
    const m = new Map<string, number>();
    players.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [players]);

  return (
    <div ref={scrollRef} className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="text-mute">
            <th className="text-left font-normal text-xs uppercase tracking-wider px-2 py-2 sticky left-0 bg-panel z-30 min-w-[8rem] shadow-[-1rem_0_0_rgb(var(--color-panel))]">
              Hole
            </th>
            {holeNumbers.map((h, idx) => (
              <th
                key={h}
                ref={
                  h === nextHoleNum
                    ? nextHoleCellRef
                    : idx === 0
                      ? firstHoleCellRef
                      : undefined
                }
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
            <th className="text-left font-normal text-[10px] uppercase tracking-wider px-2 pb-2 sticky left-0 bg-panel z-30 shadow-[-1rem_0_0_rgb(var(--color-panel))]">
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
                <td className="px-2 py-1.5 sticky left-0 bg-panel z-30 shadow-[-1rem_0_0_rgb(var(--color-panel))]">
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
                {holeNumbers.map((h, holeIdx) => {
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
                  const playerIdx = playerIndexById.get(p.id) ?? 0;
                  const refKey = `${playerIdx}:${holeIdx}`;
                  return (
                    <td key={h} className="p-0.5 text-center">
                      <input
                        ref={(el) => {
                          inputRefs.current.set(refKey, el);
                        }}
                        type="number"
                        inputMode="numeric"
                        enterKeyHint="next"
                        // DOM tab order is row-major by default, so the
                        // mobile keyboard's Next arrow walks across the
                        // row (next hole, same player) -- the opposite
                        // of how a foursome enters scores. Force a
                        // column-major order so Next jumps to the next
                        // PLAYER on the SAME hole, mirroring the
                        // Enter-key and debounce-based focusNext below.
                        tabIndex={holeIdx * players.length + playerIdx + 1}
                        min={1}
                        max={20}
                        defaultValue={val ?? ""}
                        // `locked` is the match's settled state. We
                        // intentionally do NOT also gate on the
                        // useTransition `pending` flag -- doing that
                        // briefly disabled the next-cell target while
                        // the server action was in flight, which made
                        // focusNext() silently no-op (browsers refuse
                        // to focus a disabled input). The submit is
                        // optimistic enough that keeping the inputs
                        // live throughout is fine.
                        disabled={locked}
                        onFocus={(e) => {
                          // Select existing text so a fresh tap overwrites
                          // cleanly without needing to clear first.
                          (e.target as HTMLInputElement).select();
                        }}
                        onChange={(e) => {
                          scheduleCommit(
                            refKey,
                            p.id,
                            h,
                            playerIdx,
                            holeIdx,
                            e.target.value,
                            val,
                          );
                        }}
                        onBlur={(e) => {
                          // Commit on blur without advancing (the user
                          // tapped away rather than completing the cell).
                          const existing = commitTimers.current.get(refKey);
                          if (existing) {
                            clearTimeout(existing);
                            commitTimers.current.delete(refKey);
                          }
                          const next = e.target.value.trim();
                          const prev = val === undefined ? "" : String(val);
                          if (next !== prev) submit(p.id, h, next);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const existing = commitTimers.current.get(refKey);
                            if (existing) {
                              clearTimeout(existing);
                              commitTimers.current.delete(refKey);
                            }
                            const next = (e.target as HTMLInputElement)
                              .value.trim();
                            const prev =
                              val === undefined ? "" : String(val);
                            if (next !== prev) submit(p.id, h, next);
                            focusNext(playerIdx, holeIdx);
                            e.preventDefault();
                          }
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
        Tap a cell to log strokes — entry auto-advances to the next player
        on the same hole. Green = under par, red = over. The market
        reprices after each entry, so friends watching see the chart move
        in seconds.
      </p>
    </div>
  );
}
