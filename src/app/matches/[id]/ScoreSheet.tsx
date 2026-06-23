"use client";

import { useEffect } from "react";

// Bottom-sheet score-entry surface for the on-course screen. The 1-9
// grid that used to be jammed at the bottom of OnCourseMode lives in
// here now: the entry surface slides up over a dimmed satellite,
// reads par + yardage + a faint net-relative hint, then dismisses
// itself when the player taps Save.
//
// The sheet doesn't talk to the server itself. OnCourseMode hands it
// `onSave` and `onCancel`; tapping a cell calls `onSelect` so the
// parent can echo the choice (e.g. highlight a row in the sidebar)
// and Save fires when the player commits. This keeps the existing
// optimistic / transition logic in one place.

type SheetSelection = {
  strokes: number;
  // What the selected value reads as relative to par (-2 eagle, -1
  // birdie, 0 par, +1 bogey, +2 double, etc.). The grid uses this to
  // tint the cell.
  relative: number;
} | null;

const RELATIVE_LABELS: Record<number, { label: string; cls: string }> = {
  [-3]: { label: "Albatross", cls: "text-gold" },
  [-2]: { label: "Eagle", cls: "text-gold" },
  [-1]: { label: "Birdie", cls: "text-accent" },
  0: { label: "Par", cls: "text-gold/80" },
  1: { label: "Bogey", cls: "text-mute" },
  2: { label: "Double", cls: "text-danger" },
  3: { label: "Triple", cls: "text-danger" },
};

function cellTone(relative: number, selected: boolean): string {
  if (selected) {
    return "bg-accent text-ink-on-accent border-transparent shadow-[0_8px_20px_-6px_rgb(var(--color-accent)/0.5)]";
  }
  if (relative <= -2)
    return "bg-gold/10 border-gold/40 text-gold";
  if (relative === -1)
    return "bg-accent/10 border-accent/35 text-accent";
  if (relative === 0)
    return "bg-panel border-border text-ink";
  if (relative === 1)
    return "bg-panel border-border text-mute";
  if (relative >= 2)
    return "bg-panel border-border text-danger";
  return "bg-panel border-border text-ink";
}

export default function ScoreSheet({
  open,
  hole,
  par,
  yardage,
  nextHole,
  isLastHole,
  selection,
  onSelect,
  onSave,
  onCancel,
  onSkip,
  currentPlayer,
  nextPlayer,
  previousPlayer,
  onBack,
  playerIndex,
  playerCount,
}: {
  open: boolean;
  hole: number;
  par: number;
  // Per-hole yardage if we have it (CourseHole.distanceYds). Optional
  // -- some holes haven't been measured yet.
  yardage: number | null;
  nextHole: number | null;
  isLastHole: boolean;
  selection: SheetSelection;
  onSelect: (s: SheetSelection) => void;
  onSave: () => void;
  onCancel: () => void;
  // Skip → advance to the next player on this hole without logging a
  // score (don't know it / not entering it). Only passed while
  // cycling through the group; undefined hides the Skip button.
  onSkip?: () => void;
  // Player badge at the top + cycle info. Defaults preserve the
  // pre-cycle behavior (single self-entry) when callers don't pass
  // these.
  currentPlayer?: { displayName: string; color: string };
  nextPlayer?: { displayName: string } | null;
  // Previous player in the cycle (if any) -- enables the "back" arrow
  // so the scorekeeper can re-edit an earlier player's hole.
  previousPlayer?: { displayName: string } | null;
  onBack?: () => void;
  // 1-based position in the entry cycle ("1 of 4"). Both optional;
  // when omitted the sheet hides the position indicator.
  playerIndex?: number;
  playerCount?: number;
}) {
  // Close on Escape so desktop / dev-tools navigation still works.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Grid is 1..9 (matching the on-course gesture set) with two trailing
  // affordances on the last row: "X" pickup and "—" skip. Pickup logs
  // a relative double-par (par * 2); skip leaves the hole blank but
  // dismisses the sheet.
  const cells: Array<
    | { kind: "score"; value: number }
    | { kind: "pickup" }
    | { kind: "skip" }
  > = [
    ...Array.from({ length: 9 }, (_, i) => ({
      kind: "score" as const,
      value: i + 1,
    })),
    { kind: "pickup" },
    { kind: "skip" },
  ];

  // Mid-cycle the save button stays plain "Save" -- the next player's
  // name lives on the badge above. Only when there's no next player do
  // we hint at the next hole (or end of round).
  const saveLabel = nextPlayer
    ? "Save"
    : isLastHole
      ? "Save · finish round"
      : nextHole != null
        ? `Save · go to ${nextHole}`
        : "Save";

  return (
    <>
      {/* Scrim. Tap to dismiss without saving. */}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close score entry"
        className="absolute inset-0 z-[38] bg-black/55 backdrop-blur-sm"
      />
      {/* Sheet. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Enter score for hole ${hole}`}
        className="absolute inset-x-0 bottom-0 z-40 sheet-up bg-bg rounded-t-3xl border-t border-border/80 px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.7)]"
      >
        {/* Grabber */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="block mx-auto mb-3 h-1 w-10 rounded-full bg-white/20"
        />
        {/* Player badge: who we're entering this score for. Defaults to
            the signed-in player and cycles through the group after each
            save. */}
        {currentPlayer && (
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {previousPlayer && onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-panel2/60 px-2 py-1 text-[11px] text-mute hover:text-ink"
                  aria-label={`Edit ${previousPlayer.displayName}'s score`}
                >
                  <span aria-hidden>←</span>
                  <span className="truncate max-w-[8rem]">
                    {previousPlayer.displayName}
                  </span>
                </button>
              )}
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{
                  // Fall back to the accent color when the color
                  // lookup didn't produce a string (e.g. a player
                  // without a seat value).
                  background:
                    currentPlayer.color || "rgb(var(--color-accent))",
                }}
              />
              <span className="font-display text-[15px] font-semibold tracking-tight truncate">
                {currentPlayer.displayName || "Player"}
              </span>
            </div>
            {playerCount != null && playerCount > 1 && playerIndex != null && (
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-mute shrink-0">
                {playerIndex} of {playerCount}
              </span>
            )}
          </div>
        )}
        {/* Header */}
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3 className="font-display text-[22px] font-semibold tracking-[-0.015em] leading-none">
            Hole {hole}{" "}
            <span className="text-accent font-semibold">· Par {par}</span>
          </h3>
          <div className="font-mono tabular-nums text-[11px] tracking-[0.1em] text-mute uppercase shrink-0">
            {yardage != null ? (
              <>
                {yardage}
                <span className="text-mute/60">y</span>
              </>
            ) : (
              <span className="text-mute/60">— y</span>
            )}
          </div>
        </div>
        {selection && (
          <div className="font-mono text-[11px] text-faint mb-3">
            {(() => {
              const r = selection.relative;
              const meta = RELATIVE_LABELS[r];
              const sign = r > 0 ? `+${r}` : r === 0 ? "E" : `${r}`;
              const tone =
                r < 0
                  ? "text-accent"
                  : r > 0
                    ? "text-mute"
                    : "text-gold/80";
              return (
                <>
                  <span className={tone}>{sign}</span>
                  {meta && (
                    <>
                      {" "}
                      · {meta.label.toLowerCase()} at {hole}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Grid. 5 cols. */}
        <div className="grid grid-cols-5 gap-2">
          {cells.map((c, i) => {
            if (c.kind === "pickup" || c.kind === "skip") {
              return (
                <button
                  key={c.kind}
                  type="button"
                  onClick={() => {
                    if (c.kind === "pickup") {
                      // Pickup logs a generous double-par so the round
                      // still rolls forward without leaving the hole
                      // blank.
                      onSelect({
                        strokes: par * 2,
                        relative: par,
                      });
                    } else {
                      // Skip: leave score blank, dismiss the sheet.
                      onCancel();
                    }
                  }}
                  className="aspect-square rounded-xl border border-dashed border-white/12 bg-transparent flex items-center justify-center font-mono text-lg text-faint hover:text-mute hover:border-white/20"
                  aria-label={
                    c.kind === "pickup" ? "Picked up" : "Skip hole"
                  }
                >
                  {c.kind === "pickup" ? "X" : "—"}
                </button>
              );
            }
            const value = c.value;
            const relative = value - par;
            const selected = selection?.strokes === value;
            const meta = RELATIVE_LABELS[relative];
            const relLabel = meta?.label ?? (relative > 0 ? `+${relative}` : "");
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSelect({ strokes: value, relative })}
                className={
                  "aspect-square rounded-xl border flex flex-col items-center justify-center font-mono leading-none transition-colors " +
                  cellTone(relative, selected)
                }
                aria-pressed={selected}
                aria-label={`Score ${value} (${meta?.label ?? "score"})`}
              >
                <span className="text-[22px] font-semibold tabular-nums">
                  {value}
                </span>
                {relLabel && (
                  <span
                    className={
                      "text-[9px] mt-1 tracking-[0.1em] uppercase " +
                      (selected ? "text-ink-on-accent/80" : "")
                    }
                  >
                    {relLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Action row */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border bg-transparent text-mute font-mono text-[11px] tracking-[0.1em] uppercase py-3.5 hover:bg-panel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!selection}
            className="rounded-full bg-accent text-ink-on-accent font-display font-bold text-[14px] tracking-[0.08em] uppercase py-3.5 shadow-[0_8px_20px_-8px_rgb(var(--color-accent)/0.55)] disabled:opacity-50 disabled:shadow-none"
          >
            {saveLabel}
          </button>
        </div>
        {/* Skip → next player. Only shown while cycling the group so a
            score you don't know doesn't block the rest of the
            foursome. Leaves this player's hole blank. */}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full mt-2 py-3 rounded-full border border-border bg-panel2/60 text-mute font-mono text-[11px] tracking-[0.12em] uppercase hover:text-ink"
          >
            Skip · next player →
          </button>
        )}
      </div>
    </>
  );
}
