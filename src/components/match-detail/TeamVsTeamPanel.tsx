"use client";

import { useState } from "react";
import type { TeamVsTeamHoleBreakdown } from "@/lib/sideGames";

// Hole-by-hole per-rule TVT panel. Collapses to a small "Holes" toggle
// when not expanded, opens to reveal the full strip so the standings
// block above doesn't get drowned out when the panel is closed.

export type TvtBoardPanel = {
  key: string;
  title: string;
  subtitle?: string;
  rows: {
    playerId: string;
    player: string;
    value: string;
    isLeader: boolean;
  }[];
  // Per-hole breakdown for the same rule, computed server-side from the
  // teams + scores.
  breakdown: TeamVsTeamHoleBreakdown[];
  teamLabels: { A: string; B: string };
};

export default function TeamVsTeamPanel({ panel }: { panel: TvtBoardPanel }) {
  const [open, setOpen] = useState(false);
  const played = panel.breakdown.filter((b) => b.winner !== null).length;
  const aWins = panel.breakdown.filter((b) => b.winner === "A").length;
  const bWins = panel.breakdown.filter((b) => b.winner === "B").length;
  const ties = panel.breakdown.filter((b) => b.winner === "TIE").length;

  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs uppercase tracking-wider text-accent font-medium">
          {panel.title}
        </div>
        {panel.subtitle && (
          <div className="text-[10px] text-mute">{panel.subtitle}</div>
        )}
      </div>
      <ul className="space-y-1.5">
        {panel.rows.map((r, i) => (
          <li
            key={r.playerId}
            className="flex items-center justify-between text-sm"
          >
            <span
              className={
                "truncate " +
                (r.isLeader ? "text-ink font-medium" : "text-mute")
              }
            >
              {i + 1}. {r.player}
            </span>
            <span
              className={
                "font-mono tabular-nums shrink-0 " +
                (r.isLeader ? "text-accent" : "text-mute")
              }
            >
              {r.value}
            </span>
          </li>
        ))}
      </ul>

      {played > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 w-full flex items-center justify-between text-[11px] text-mute hover:text-ink transition-colors"
            aria-expanded={open}
          >
            <span className="font-mono uppercase tracking-wider">
              Holes
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[10px]">
                <span className="text-accent">A {aWins}</span>
                {" · "}
                <span className="text-accent">B {bWins}</span>
                {ties > 0 && (
                  <>
                    {" · "}
                    <span>{ties} tie{ties === 1 ? "" : "s"}</span>
                  </>
                )}
              </span>
              <span
                className={
                  "transition-transform " + (open ? "rotate-180" : "")
                }
                aria-hidden
              >
                ▾
              </span>
            </span>
          </button>
          {open && (
            <HoleStrip
              breakdown={panel.breakdown}
              teamLabels={panel.teamLabels}
            />
          )}
        </>
      )}
    </div>
  );
}

function HoleStrip({
  breakdown,
  teamLabels,
}: {
  breakdown: TeamVsTeamHoleBreakdown[];
  teamLabels: { A: string; B: string };
}) {
  // Horizontal scroll on narrow screens so 18 columns don't squeeze
  // the cells unreadably small.
  return (
    <div className="mt-2 overflow-x-auto -mx-1 px-1">
      <table className="text-[10.5px] font-mono tabular-nums w-full min-w-max">
        <thead>
          <tr className="text-faint">
            <th className="text-left pr-2 font-normal sticky left-0 bg-panel">
              Hole
            </th>
            {breakdown.map((b) => (
              <th
                key={`h-${b.hole}`}
                className="px-1 text-center font-normal"
              >
                {b.hole}
              </th>
            ))}
          </tr>
          <tr className="text-faint">
            <th className="text-left pr-2 font-normal sticky left-0 bg-panel">
              Par
            </th>
            {breakdown.map((b) => (
              <th
                key={`p-${b.hole}`}
                className="px-1 text-center font-normal"
              >
                {b.par}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <ScoreRow
            label={teamLabels.A}
            breakdown={breakdown}
            pick={(b) => b.teamA}
            isWinner={(b) => b.winner === "A"}
            isTie={(b) => b.winner === "TIE"}
          />
          <ScoreRow
            label={teamLabels.B}
            breakdown={breakdown}
            pick={(b) => b.teamB}
            isWinner={(b) => b.winner === "B"}
            isTie={(b) => b.winner === "TIE"}
          />
        </tbody>
      </table>
    </div>
  );
}

function ScoreRow({
  label,
  breakdown,
  pick,
  isWinner,
  isTie,
}: {
  label: string;
  breakdown: TeamVsTeamHoleBreakdown[];
  pick: (b: TeamVsTeamHoleBreakdown) => number | null;
  isWinner: (b: TeamVsTeamHoleBreakdown) => boolean;
  isTie: (b: TeamVsTeamHoleBreakdown) => boolean;
}) {
  return (
    <tr>
      <td className="text-left pr-2 text-mute sticky left-0 bg-panel truncate max-w-[5rem]">
        {label}
      </td>
      {breakdown.map((b) => {
        const v = pick(b);
        const win = isWinner(b);
        const tie = isTie(b);
        return (
          <td
            key={`s-${label}-${b.hole}`}
            className={
              "px-1 text-center " +
              (v == null
                ? "text-faint"
                : win
                  ? "text-accent font-semibold"
                  : tie
                    ? "text-mute"
                    : "text-mute")
            }
          >
            {v == null ? "·" : v}
          </td>
        );
      })}
    </tr>
  );
}
