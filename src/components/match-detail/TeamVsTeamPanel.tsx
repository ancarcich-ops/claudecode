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
  // Player rosters are stable across holes -- pull from the first
  // breakdown entry so the rows always render in roster order.
  const teamARoster = breakdown[0]?.teamAPlayers ?? [];
  const teamBRoster = breakdown[0]?.teamBPlayers ?? [];

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
          {/* TEAM A header + per-player rows + team total */}
          <tr className="text-faint">
            <td
              colSpan={breakdown.length + 1}
              className="pt-2 pb-0.5 text-[9px] uppercase tracking-wider sticky left-0 bg-panel"
            >
              {teamLabels.A}
            </td>
          </tr>
          {teamARoster.map((p, idx) => (
            <PlayerRow
              key={`A-${p.playerId}`}
              displayName={p.displayName}
              breakdown={breakdown}
              pick={(b) => b.teamAPlayers[idx] ?? null}
            />
          ))}
          <TeamTotalRow
            label="Total"
            breakdown={breakdown}
            pick={(b) => b.teamA}
            isWinner={(b) => b.winner === "A"}
            isTie={(b) => b.winner === "TIE"}
          />
          {/* TEAM B */}
          <tr className="text-faint">
            <td
              colSpan={breakdown.length + 1}
              className="pt-2 pb-0.5 text-[9px] uppercase tracking-wider sticky left-0 bg-panel"
            >
              {teamLabels.B}
            </td>
          </tr>
          {teamBRoster.map((p, idx) => (
            <PlayerRow
              key={`B-${p.playerId}`}
              displayName={p.displayName}
              breakdown={breakdown}
              pick={(b) => b.teamBPlayers[idx] ?? null}
            />
          ))}
          <TeamTotalRow
            label="Total"
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

function PlayerRow({
  displayName,
  breakdown,
  pick,
}: {
  displayName: string;
  breakdown: TeamVsTeamHoleBreakdown[];
  pick: (b: TeamVsTeamHoleBreakdown) => {
    score: number | null;
    contributed: boolean;
  } | null;
}) {
  return (
    <tr>
      <td className="text-left pr-2 text-mute sticky left-0 bg-panel truncate max-w-[6rem]">
        {displayName}
      </td>
      {breakdown.map((b) => {
        const cell = pick(b);
        const score = cell?.score ?? null;
        const contributed = cell?.contributed ?? false;
        return (
          <td
            key={`pc-${displayName}-${b.hole}`}
            className={
              "px-1 text-center " +
              (score == null
                ? "text-faint"
                : contributed
                  ? "text-accent font-semibold"
                  : "text-mute")
            }
          >
            {score == null ? "·" : score}
          </td>
        );
      })}
    </tr>
  );
}

function TeamTotalRow({
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
    <tr className="border-t border-border/40">
      <td className="text-left pr-2 text-[9px] uppercase tracking-wider text-faint sticky left-0 bg-panel">
        {label}
      </td>
      {breakdown.map((b) => {
        const v = pick(b);
        const win = isWinner(b);
        const tie = isTie(b);
        return (
          <td
            key={`tt-${label}-${b.hole}`}
            className={
              "px-1 text-center " +
              (v == null
                ? "text-faint"
                : win
                  ? "text-ink font-semibold bg-accent/10 rounded"
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
