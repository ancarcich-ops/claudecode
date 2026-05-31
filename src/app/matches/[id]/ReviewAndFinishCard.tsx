"use client";

// Surfaces a "Review and finish round" affordance the moment every
// player has logged every hole. Two ways in:
//   1. Auto-open on the first render after the round becomes complete
//      (gated by sessionStorage so it only happens once per session).
//   2. Tap the inline button any time before the round is marked final.
// Submitting calls completeMatchAction (already wired for "Mark final"
// elsewhere) -- this is just a nicer wrapper that shows the scorecard
// summary so the user can confirm before it's set in stone.

import { useEffect, useRef, useState, useTransition } from "react";

type Player = {
  id: string;
  displayName: string;
  handicap: number;
  color: string;
  scores: { hole: number; strokes: number }[];
};

export default function ReviewAndFinishCard({
  matchId,
  holes,
  startingHole,
  pars,
  scoringMode,
  players,
  completeAction,
}: {
  matchId: string;
  holes: number;
  startingHole: number;
  pars: number[];
  scoringMode: "NET" | "GROSS" | "CUSTOM";
  players: Player[];
  completeAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, startTransition] = useTransition();
  const autoOpenedRef = useRef(false);

  // Auto-open the review sheet on the first render after the round
  // completes -- but only once per session so the user isn't punished
  // for closing it and coming back.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (typeof window === "undefined") return;
    const key = `reviewed-${matchId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // private mode etc. -- still open; we just won't remember.
    }
    setOpen(true);
  }, [matchId]);

  const submit = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      await completeAction(fd);
      setOpen(false);
    });
  };

  return (
    <>
      <section className="card p-4 border-accent/40 bg-accent/[0.04]">
        <h2 className="font-display text-base font-semibold text-ink">
          Round complete
        </h2>
        <p className="text-[11px] text-mute mt-0.5 mb-3">
          Every hole is logged for every player. Review the scorecard, then
          finish the round.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-primary w-full"
        >
          Review and finish round →
        </button>
      </section>

      {open && (
        <ReviewSheet
          onClose={() => setOpen(false)}
          onSubmit={submit}
          submitting={submitting}
          holes={holes}
          startingHole={startingHole}
          pars={pars}
          scoringMode={scoringMode}
          players={players}
        />
      )}
    </>
  );
}

function ReviewSheet({
  onClose,
  onSubmit,
  submitting,
  holes,
  startingHole,
  pars,
  scoringMode,
  players,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  holes: number;
  startingHole: number;
  pars: number[];
  scoringMode: "NET" | "GROSS" | "CUSTOM";
  players: Player[];
}) {
  const holeNumbers: number[] = [];
  for (let i = 0; i < holes; i++) holeNumbers.push(startingHole + i);

  // Per-player totals + rank by the round's scoring mode (gross for
  // GROSS rounds, gross-minus-allowance for NET / CUSTOM).
  const useNet = scoringMode !== "GROSS";
  const totals = players.map((p) => {
    const gross = p.scores.reduce((s, x) => s + x.strokes, 0);
    return {
      ...p,
      gross,
      net: useNet ? gross - p.handicap : gross,
    };
  });
  const rankedIds = [...totals]
    .sort((a, b) => a.net - b.net)
    .map((t) => t.id);
  const totalPar = pars.reduce((s, x) => s + x, 0);

  return (
    <div
      // z-50 so we render above the fixed MobileTabBar (z-40), which
      // was otherwise covering the sheet's footer on mobile.
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="card max-w-2xl w-full max-h-[88dvh] flex flex-col overflow-hidden sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Review round
            </h2>
            <p className="text-[11px] text-mute">
              Confirm and finish to lock in the result.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-mute hover:text-ink text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
          {/* Per-player totals ranked. */}
          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-mute mb-2">
              Standings
            </h3>
            <ul className="space-y-1.5">
              {totals
                .slice()
                .sort((a, b) => a.net - b.net)
                .map((t) => {
                  const rank = rankedIds.indexOf(t.id) + 1;
                  const isWinner = rank === 1;
                  return (
                    <li
                      key={t.id}
                      className={
                        "flex items-center gap-3 rounded-md border px-3 py-2 " +
                        (isWinner
                          ? "border-gold/40 bg-gold/[0.06]"
                          : "border-border bg-panel2/40")
                      }
                    >
                      <span
                        className={
                          "font-mono text-xs w-5 text-right " +
                          (isWinner ? "text-gold" : "text-faint")
                        }
                      >
                        {rank}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: t.color }}
                      />
                      <span
                        className={
                          "text-sm flex-1 truncate " +
                          (isWinner ? "text-gold font-medium" : "text-ink")
                        }
                      >
                        {t.displayName}
                      </span>
                      <span className="font-mono text-[10.5px] text-mute shrink-0">
                        gross{" "}
                        <span className="text-ink">{t.gross}</span>
                      </span>
                      {useNet && (
                        <span className="font-mono text-[10.5px] text-mute shrink-0">
                          net{" "}
                          <span className="text-ink">{t.net}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>

          {/* Compact per-hole grid. */}
          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-mute mb-2">
              Per hole
            </h3>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="text-[11px] font-mono tabular-nums w-full">
                <thead>
                  <tr className="bg-panel2/60 text-mute">
                    <th className="sticky left-0 bg-panel2/60 text-left px-2 py-1.5 font-medium uppercase tracking-wider">
                      Hole
                    </th>
                    {holeNumbers.map((h) => (
                      <th
                        key={h}
                        className="px-1.5 py-1.5 text-center font-medium"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right text-ink font-medium">
                      Σ
                    </th>
                  </tr>
                  <tr className="text-faint border-t border-border">
                    <th className="sticky left-0 bg-panel text-left px-2 py-1 font-normal uppercase tracking-wider">
                      Par
                    </th>
                    {holeNumbers.map((h, i) => (
                      <td key={h} className="px-1.5 py-1 text-center">
                        {pars[i] ?? "—"}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right text-ink">
                      {totalPar}
                    </td>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {totals.map((t) => {
                    const byHole = new Map(
                      t.scores.map((s) => [s.hole, s.strokes]),
                    );
                    return (
                      <tr key={t.id}>
                        <th
                          scope="row"
                          className="sticky left-0 bg-panel text-left px-2 py-1.5 font-medium text-ink whitespace-nowrap"
                        >
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                            style={{ background: t.color }}
                          />
                          {t.displayName}
                        </th>
                        {holeNumbers.map((h, i) => {
                          const strokes = byHole.get(h);
                          const par = pars[i] ?? 4;
                          const rel = strokes != null ? strokes - par : null;
                          const tone =
                            rel == null
                              ? "text-faint"
                              : rel < 0
                                ? "text-accent"
                                : rel > 0
                                  ? "text-danger"
                                  : "text-ink";
                          return (
                            <td
                              key={h}
                              className={
                                "px-1.5 py-1.5 text-center " + tone
                              }
                            >
                              {strokes ?? "—"}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right text-ink">
                          {t.gross}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer
          // Respect the iPhone home-indicator safe area so the buttons
          // don't sit under the swipe-up zone.
          style={{
            paddingBottom:
              "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
          }}
          className="border-t border-border px-3 pt-3 flex items-center gap-2"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn btn-ghost flex-1 disabled:opacity-50"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="btn btn-primary flex-1 disabled:opacity-50"
          >
            {submitting ? "Finishing…" : "Submit and finish"}
          </button>
        </footer>
      </div>
    </div>
  );
}
