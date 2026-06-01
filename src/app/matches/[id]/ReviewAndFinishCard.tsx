"use client";

// Surfaces a "Review and finish round" affordance the moment every
// player has logged every hole. Two ways in:
//   1. Auto-open on the first render after the round becomes complete
//      (gated by sessionStorage so it only happens once per session).
//   2. Tap the inline button any time before the round is marked final.
// Submitting calls completeMatchAction (already wired for "Mark final"
// elsewhere) -- this is just a richer wrapper that shows the
// scorecard summary so the user can confirm before it's set in stone.

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
  courseName,
  scheduledAt,
  holes,
  startingHole,
  pars,
  scoringMode,
  players,
  completeAction,
}: {
  matchId: string;
  courseName: string;
  scheduledAt: string;
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
          courseName={courseName}
          scheduledAt={scheduledAt}
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
  courseName,
  scheduledAt,
  holes,
  startingHole,
  pars,
  scoringMode,
  players,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  courseName: string;
  scheduledAt: string;
  holes: number;
  startingHole: number;
  pars: number[];
  scoringMode: "NET" | "GROSS" | "CUSTOM";
  players: Player[];
}) {
  // Per-player rollups indexed by hole number for fast lookup.
  const useNet = scoringMode !== "GROSS";
  const enriched = players.map((p) => {
    const byHole = new Map(p.scores.map((s) => [s.hole, s.strokes]));
    const orderedStrokes: number[] = [];
    for (let i = 0; i < holes; i++) {
      const h = startingHole + i;
      orderedStrokes.push(byHole.get(h) ?? 0);
    }
    const out = orderedStrokes.slice(0, 9).reduce((s, n) => s + n, 0);
    const inn = orderedStrokes.slice(9).reduce((s, n) => s + n, 0);
    const gross = out + inn;
    const net = useNet ? gross - p.handicap : gross;
    return { ...p, orderedStrokes, out, inn, gross, net };
  });
  const totalPar = pars.reduce((s, x) => s + x, 0);
  const frontPar = pars.slice(0, 9).reduce((s, x) => s + x, 0);
  const backPar = pars.slice(9).reduce((s, x) => s + x, 0);

  // Rank by the round's scoring mode to crown a winner. Solo rounds
  // come in as a single-player array; we keep the crown off so the
  // language stays honest (no opponent = no win).
  const ranked = [...enriched].sort((a, b) => a.net - b.net);
  const winnerId = players.length > 1 ? ranked[0]?.id : null;

  // Date label in the same shape the design uses ("Sat · May 31").
  const dateLabel = (() => {
    try {
      const d = new Date(scheduledAt);
      const dow = d.toLocaleDateString(undefined, { weekday: "short" });
      const md = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      return `${dow} · ${md}`;
    } catch {
      return "";
    }
  })();

  return (
    <div
      // z-50 so we render above the fixed MobileTabBar (z-40), which
      // was otherwise covering the sheet's footer on mobile.
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-3"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-bg max-w-2xl w-full max-h-[92dvh] sm:max-h-[88dvh] flex flex-col overflow-hidden sheet-up rounded-t-2xl sm:rounded-md border-t border-border sm:border sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber handle for the mobile bottom-sheet feel. */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Sticky summary header — eyebrow, "Sign the card", course/date/holes. */}
        <header className="px-4 pt-2 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-accent flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Round complete · review
              </div>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink mt-1.5 leading-tight">
                Sign the card.
              </h2>
              <p className="font-mono text-[10.5px] text-mute mt-1 truncate">
                {courseName}
                {dateLabel ? ` · ${dateLabel}` : ""} ·{" "}
                <span className="text-accent">
                  {holes} of {holes} holes in
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-mute hover:text-ink text-2xl leading-none px-2 shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        {/* Scroll body: front nine grid, optional back nine grid, totals. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-4 space-y-4">
          <NineGridCard
            label="Front nine"
            holeNumbers={holeRange(startingHole, 0, Math.min(9, holes))}
            pars={pars.slice(0, 9)}
            parSum={frontPar}
            players={enriched}
            strokesSlice={(p) => p.orderedStrokes.slice(0, 9)}
            sumLabel="Out"
            sumValue={(p) => p.out}
          />

          {holes === 18 && (
            <NineGridCard
              label="Back nine"
              holeNumbers={holeRange(startingHole, 9, 9)}
              pars={pars.slice(9)}
              parSum={backPar}
              players={enriched}
              strokesSlice={(p) => p.orderedStrokes.slice(9)}
              sumLabel="In"
              sumValue={(p) => p.inn}
            />
          )}

          <SectionLabel label="Totals" />
          <TotalsTable
            players={enriched}
            useNet={useNet}
            totalPar={totalPar}
            winnerId={winnerId}
            showInColumn={holes === 18}
          />
        </div>

        {/* Footer CTA — single primary action, ghost subline below. */}
        <footer
          // Respect the iPhone home-indicator safe area so the buttons
          // don't sit under the swipe-up zone.
          style={{
            paddingBottom:
              "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
          }}
          className="border-t border-border px-4 pt-3 flex flex-col gap-2 shrink-0"
        >
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className={
              "w-full font-display font-bold uppercase tracking-wider text-[15px] " +
              "py-3.5 rounded-full text-center flex items-center justify-center gap-2.5 " +
              "bg-accent text-bg shadow-[0_12px_30px_-10px_rgb(var(--color-accent)/0.5),0_0_0_1px_rgb(var(--color-accent)/0.4)] " +
              "disabled:opacity-60 disabled:cursor-not-allowed"
            }
          >
            {submitting ? (
              "Finishing…"
            ) : (
              <>
                Submit &amp; finish round
                <span className="font-mono text-sm">→</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-center font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute hover:text-ink py-0.5 disabled:opacity-50"
          >
            Not yet — keep reviewing
          </button>
        </footer>
      </div>
    </div>
  );
}

// Build hole-number array from `startingHole`, slicing nine at a time.
// `offset` 0 = front, 9 = back. `length` lets the front-9 case shrink
// when the match is a 9-hole round.
function holeRange(startingHole: number, offset: number, length: number) {
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push(startingHole + offset + i);
  return out;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-faint flex items-center gap-2.5 px-0.5">
      <span>{label}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

type Enriched = Player & {
  orderedStrokes: number[];
  out: number;
  inn: number;
  gross: number;
  net: number;
};

function NineGridCard({
  label,
  holeNumbers,
  pars,
  parSum,
  players,
  strokesSlice,
  sumLabel,
  sumValue,
}: {
  label: string;
  holeNumbers: number[];
  pars: number[];
  parSum: number;
  players: Enriched[];
  strokesSlice: (p: Enriched) => number[];
  sumLabel: string;
  sumValue: (p: Enriched) => number;
}) {
  return (
    <div className="space-y-2">
      <SectionLabel label={label} />
      <div className="rounded-xl border border-border bg-panel overflow-hidden">
        {/* Card header: nine tab + par hint. */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase">
            <span className="bg-accent text-bg rounded px-1.5 py-0.5">
              {label.split(" ")[0]}
            </span>
          </span>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-faint">
            Par {parSum}
          </span>
        </div>

        {/* Score grid. */}
        <div className="overflow-x-auto">
          <table className="w-full text-center font-mono tabular-nums">
            <thead>
              <tr className="text-faint">
                <th className="text-left pl-3 pr-1 py-2 text-[8px] tracking-[0.1em] uppercase font-medium">
                  Player
                </th>
                {holeNumbers.map((h) => (
                  <th key={h} className="px-0 py-2 text-[8px] font-medium">
                    {h}
                  </th>
                ))}
                <th className="px-2 py-2 text-[8px] tracking-[0.04em] uppercase font-medium text-mute">
                  {sumLabel}
                </th>
              </tr>
              <tr className="bg-bg/30 border-b border-border">
                <td className="text-left pl-3 pr-1 py-1.5 text-[8.5px] tracking-[0.08em] uppercase text-faint">
                  Par
                </td>
                {pars.map((p, i) => (
                  <td
                    key={i}
                    className="py-1.5 text-[8.5px] text-faint"
                  >
                    {p}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-[8.5px] text-faint">
                  {parSum}
                </td>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const strokes = strokesSlice(p);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border/40 last:border-b-0"
                  >
                    <td className="text-left pl-2.5 pr-1 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded-full inline-flex items-center justify-center font-mono text-[7.5px] font-semibold"
                          style={{
                            background: `${p.color}26`,
                            border: `1px solid ${p.color}66`,
                            color: p.color,
                          }}
                        >
                          {initials(p.displayName)}
                        </span>
                        <span className="text-[11px] font-medium text-ink truncate">
                          {p.displayName}
                        </span>
                      </span>
                    </td>
                    {strokes.map((s, i) => {
                      const par = pars[i] ?? 4;
                      const diff = s - par;
                      const tone =
                        diff <= -2
                          ? "text-gold"
                          : diff === -1
                            ? "text-accent"
                            : diff >= 1
                              ? "text-danger"
                              : "text-ink";
                      return (
                        <td key={i} className={"py-1.5 text-[11px] " + tone}>
                          {s || "—"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-[11px] text-ink font-semibold bg-bg/30">
                      {sumValue(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TotalsTable({
  players,
  useNet,
  totalPar,
  winnerId,
  showInColumn,
}: {
  players: Enriched[];
  useNet: boolean;
  totalPar: number;
  winnerId: string | null;
  showInColumn: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-center font-mono tabular-nums">
          <thead>
            <tr className="text-mute border-b border-border">
              <th className="text-left pl-3 pr-1 py-2 text-[8px] tracking-[0.1em] uppercase font-medium text-faint">
                Totals
              </th>
              <th className="px-2 py-2 text-[8px] tracking-[0.04em] uppercase font-medium">
                Out
              </th>
              {showInColumn && (
                <th className="px-2 py-2 text-[8px] tracking-[0.04em] uppercase font-medium">
                  In
                </th>
              )}
              <th className="px-2 py-2 text-[8px] tracking-[0.04em] uppercase font-medium">
                Gross
              </th>
              <th className="px-2 py-2 text-[8px] tracking-[0.04em] uppercase font-medium">
                +/−
              </th>
              {useNet && (
                <th className="px-2 py-2 text-[8px] tracking-[0.04em] uppercase font-medium">
                  Net
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const vsPar = p.gross - totalPar;
              const vsParColor =
                vsPar < 0
                  ? "text-accent"
                  : vsPar > 0
                    ? "text-danger"
                    : "text-gold";
              const vsParLabel =
                vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : String(vsPar);
              const isWinner = p.id === winnerId;
              return (
                <tr
                  key={p.id}
                  className="border-b border-border/40 last:border-b-0"
                >
                  <td className="text-left pl-2.5 pr-1 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full inline-flex items-center justify-center font-mono text-[7.5px] font-semibold"
                        style={{
                          background: `${p.color}26`,
                          border: `1px solid ${p.color}66`,
                          color: p.color,
                        }}
                      >
                        {initials(p.displayName)}
                      </span>
                      <span className="text-[11px] font-sans font-medium text-ink truncate">
                        {p.displayName}
                      </span>
                      {isWinner && (
                        <span className="font-mono text-[7.5px] tracking-[0.1em] uppercase text-gold border border-gold/40 rounded px-1 py-px ml-0.5">
                          Win
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-ink">{p.out}</td>
                  {showInColumn && (
                    <td className="px-2 py-2 text-[11px] text-ink">{p.inn}</td>
                  )}
                  <td className="px-2 py-2 text-[11px] text-ink font-semibold bg-bg/30">
                    {p.gross}
                  </td>
                  <td className={"px-2 py-2 text-[11px] " + vsParColor}>
                    {vsParLabel}
                  </td>
                  {useNet && (
                    <td className="px-2 py-2 text-[11px] text-accent font-semibold bg-accent/[0.06]">
                      {p.net}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
