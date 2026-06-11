"use client";

import { useState } from "react";
import TournamentLeaderboardTable from "./TournamentLeaderboardTable";
import TournamentOddsTable from "./TournamentOddsTable";
import type { LeaderboardRow } from "@/lib/tournaments";
import type { TournamentOddsRow } from "@/lib/tournamentOdds";

// Tab toggle for the Leaderboard <-> Odds views on the tournament
// detail page. Server component renders both data sets (cheap) and
// hands them to this client wrapper, which swaps the visible table
// based on local state. We don't persist the selection to the URL --
// the leaderboard is the default and a refresh is a fine reset.

export default function TournamentBoardTabs({
  leaderboardRows,
  oddsRows,
  roundCount,
  scoringMode,
}: {
  leaderboardRows: LeaderboardRow[];
  oddsRows: TournamentOddsRow[];
  roundCount: number;
  scoringMode: string;
}) {
  const [view, setView] = useState<"leaderboard" | "odds">("leaderboard");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-xs font-mono">
        <TabButton
          active={view === "leaderboard"}
          onClick={() => setView("leaderboard")}
        >
          Leaderboard
        </TabButton>
        <TabButton
          active={view === "odds"}
          onClick={() => setView("odds")}
        >
          Odds
        </TabButton>
      </div>
      {view === "leaderboard" ? (
        <TournamentLeaderboardTable
          rows={leaderboardRows}
          roundCount={roundCount}
          scoringMode={scoringMode}
        />
      ) : (
        <TournamentOddsTable
          rows={oddsRows}
          roundCount={roundCount}
          scoringMode={scoringMode}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded-md uppercase tracking-wider transition-colors " +
        (active
          ? "bg-panel2 text-ink border border-border"
          : "text-mute hover:text-ink hover:bg-panel2/60")
      }
    >
      {children}
    </button>
  );
}
