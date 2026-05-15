"use client";

import { useState } from "react";
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
  | "NASSAU_TOTAL";

export type SideGameSeries = {
  stableford?: { rows: SgRow[] };
  skins?: { rows: SgRow[] };
  nassauF9?: { rows: SgRow[] };
  nassauB9?: { rows: SgRow[] };
  nassauTotal?: { rows: SgRow[] };
};

export default function MatchChartTabs({
  oddsSeries,
  players,
  sideGames,
}: {
  oddsSeries: OddsRow[];
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
                  "text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors " +
                  (isActive
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-mute hover:text-ink")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {active === "ODDS" && (
        <OddsChart series={oddsSeries} players={players} />
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
    </div>
  );
}
