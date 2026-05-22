"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import OddsChart from "./OddsChart";
import SideGameChart from "./SideGameChart";

type OddsRow = { t: number } & Record<string, number>;
type SgRow = { hole: number } & Record<string, number>;
type PlayerMeta = { id: string; displayName: string; color: string };

export type ChartTabId =
  | "ODDS"
  | "STABLEFORD"
  | "SKINS"
  | "NASSAU_F9"
  | "NASSAU_B9"
  | "NASSAU_TOTAL"
  | "BBB"
  | "SNAKE"
  | "WOLF";

export type SideGameSeries = {
  stableford?: { rows: SgRow[] };
  skins?: { rows: SgRow[] };
  nassauF9?: { rows: SgRow[] };
  nassauB9?: { rows: SgRow[] };
  nassauTotal?: { rows: SgRow[] };
  bbb?: { rows: SgRow[] };
  snake?: { rows: SgRow[] };
  wolf?: { rows: SgRow[] };
};

type OddsHoleRow = { hole: number } & Record<string, number>;

export default function MatchChartTabs({
  oddsSeries,
  oddsHoleSeries,
  oddsXMode,
  players,
  sideGames,
}: {
  oddsSeries: OddsRow[];
  // Once the round starts, the server bucketises odds snapshots by
  // hole and the chart switches to a hole-based x-axis. Null while
  // the match is still pre-round.
  oddsHoleSeries: OddsHoleRow[] | null;
  oddsXMode: "time" | "hole";
  players: PlayerMeta[];
  sideGames: SideGameSeries;
}) {
  const tabs: { id: ChartTabId; label: string }[] = [
    { id: "ODDS", label: "Win %" },
  ];
  if (sideGames.stableford) tabs.push({ id: "STABLEFORD", label: "Stableford" });
  if (sideGames.skins) tabs.push({ id: "SKINS", label: "Skins" });
  if (sideGames.nassauF9) tabs.push({ id: "NASSAU_F9", label: "Nassau · F9" });
  if (sideGames.nassauB9) tabs.push({ id: "NASSAU_B9", label: "Nassau · B9" });
  if (sideGames.nassauTotal)
    tabs.push({ id: "NASSAU_TOTAL", label: "Nassau · Total" });
  if (sideGames.bbb) tabs.push({ id: "BBB", label: "BBB" });
  if (sideGames.snake) tabs.push({ id: "SNAKE", label: "Snake" });
  if (sideGames.wolf) tabs.push({ id: "WOLF", label: "Wolf" });

  const [active, setActive] = useState<ChartTabId>("ODDS");

  // If the active tab was removed (e.g. side game disabled), fall back to Odds.
  const tabIds = new Set(tabs.map((t) => t.id));
  if (!tabIds.has(active)) setActive("ODDS");

  return (
    <div>
      {tabs.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-1.5 mb-3"
          role="tablist"
          aria-label="Chart view"
        >
          {tabs.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.id)}
                className={
                  "relative text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors " +
                  (isActive ? "text-accent" : "text-mute hover:text-ink")
                }
              >
                {isActive && (
                  <motion.span
                    layoutId="chart-tab-active"
                    className="absolute inset-0 rounded-full border border-accent bg-accent/10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {active === "ODDS" && (
        <OddsChart
          series={oddsSeries}
          holeSeries={oddsHoleSeries}
          xMode={oddsXMode}
          players={players}
        />
      )}
      {active === "STABLEFORD" && sideGames.stableford && (
        <SideGameChart
          rows={sideGames.stableford.rows}
          players={players}
          yLabel="points (cumulative)"
          valueFormatter={(n) => `${n} pt${n === 1 ? "" : "s"}`}
          yDomain={[0, "auto"]}
        />
      )}
      {active === "SKINS" && sideGames.skins && (
        <SideGameChart
          rows={sideGames.skins.rows}
          players={players}
          yLabel="skins won"
          valueFormatter={(n) => `${n} skin${n === 1 ? "" : "s"}`}
          yDomain={[0, "auto"]}
        />
      )}
      {active === "NASSAU_F9" && sideGames.nassauF9 && (
        <SideGameChart
          rows={sideGames.nassauF9.rows}
          players={players}
          yLabel="net vs par (lower wins)"
          valueFormatter={(n) =>
            n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`
          }
        />
      )}
      {active === "NASSAU_B9" && sideGames.nassauB9 && (
        <SideGameChart
          rows={sideGames.nassauB9.rows}
          players={players}
          yLabel="net vs par (lower wins)"
          valueFormatter={(n) =>
            n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`
          }
        />
      )}
      {active === "NASSAU_TOTAL" && sideGames.nassauTotal && (
        <SideGameChart
          rows={sideGames.nassauTotal.rows}
          players={players}
          yLabel="net vs par (lower wins)"
          valueFormatter={(n) =>
            n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`
          }
        />
      )}
      {active === "BBB" && sideGames.bbb && (
        <SideGameChart
          rows={sideGames.bbb.rows}
          players={players}
          yLabel="points (cumulative)"
          valueFormatter={(n) => `${n} pt${n === 1 ? "" : "s"}`}
          yDomain={[0, "auto"]}
        />
      )}
      {active === "SNAKE" && sideGames.snake && (
        <SideGameChart
          rows={sideGames.snake.rows}
          players={players}
          yLabel="3-putts (lower wins)"
          valueFormatter={(n) => `${n} 3-putt${n === 1 ? "" : "s"}`}
          yDomain={[0, "auto"]}
        />
      )}
      {active === "WOLF" && sideGames.wolf && (
        <SideGameChart
          rows={sideGames.wolf.rows}
          players={players}
          yLabel="points (cumulative)"
          valueFormatter={(n) => `${n} pt${n === 1 ? "" : "s"}`}
          yDomain={[0, "auto"]}
        />
      )}
    </div>
  );
}
