"use client";

import { useMemo, useState } from "react";
import type { LeaderboardRow } from "@/lib/leaderboard";
import PlayerAvatar from "@/components/Avatar";

type ColumnKey =
  | "displayName"
  | "matchesPlayed"
  | "mainWins"
  | "stablefordWins"
  | "skinsWins"
  | "nassauWins"
  | "bbbWins"
  | "snakeWins"
  | "wolfWins"
  | "totalWins";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  hint: string;
  numeric: boolean;
  show: boolean;
  accent?: boolean;
};

export default function LeaderboardTable({
  rows,
  meUserId,
  columns,
}: {
  rows: LeaderboardRow[];
  meUserId: string;
  columns: ColumnDef[];
}) {
  const [sortKey, setSortKey] = useState<ColumnKey>("mainWins");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = (a as unknown as Record<ColumnKey, number | string>)[sortKey];
      const bv = (b as unknown as Record<ColumnKey, number | string>)[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      // Tiebreaker: main wins, then total wins, then username -- so the table
      // stays stable when secondary columns tie.
      if (cmp === 0 && sortKey !== "mainWins") cmp = a.mainWins - b.mainWins;
      if (cmp === 0 && sortKey !== "totalWins") cmp = a.totalWins - b.totalWins;
      if (cmp === 0) cmp = a.username.localeCompare(b.username);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const onHeaderClick = (key: ColumnKey, numeric: boolean) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numeric columns default to desc (more wins on top); name defaults asc.
      setSortDir(numeric ? "desc" : "asc");
    }
  };

  return (
    <div className="card p-1 sm:p-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-mute">
            <SortHeader
              label="Player"
              k="displayName"
              sortKey={sortKey}
              sortDir={sortDir}
              onClick={() => onHeaderClick("displayName", false)}
              align="left"
              sticky
            />
            <SortHeader
              label="GP"
              k="matchesPlayed"
              sortKey={sortKey}
              sortDir={sortDir}
              onClick={() => onHeaderClick("matchesPlayed", true)}
              align="right"
              hint="Matches played"
            />
            {columns.map((c) => (
              <SortHeader
                key={c.key}
                label={c.label}
                k={c.key}
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={() => onHeaderClick(c.key, c.numeric)}
                align="right"
                hint={c.hint}
              />
            ))}
            <SortHeader
              label="All"
              k="totalWins"
              sortKey={sortKey}
              sortDir={sortDir}
              onClick={() => onHeaderClick("totalWins", true)}
              align="right"
              accent
              hint="Across all games"
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isYou = r.userId === meUserId;
            const displayName = r.displayName ?? r.username;
            return (
              <tr
                key={r.userId}
                className="border-t border-border hover:bg-panel2/30"
              >
                <td className="py-2 px-2 sticky left-0 bg-panel">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar
                      seed={r.avatarSeed ?? r.username}
                      variant={
                        (r.avatarVariant as
                          | "beam"
                          | "marble"
                          | "sunset"
                          | "pixel"
                          | "ring"
                          | "bauhaus"
                          | null) ?? "beam"
                      }
                      avatarUrl={r.avatarUrl}
                      size={24}
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate max-w-[8rem] sm:max-w-[10rem]">
                        {displayName}
                        {isYou && (
                          <span className="text-mute font-normal"> (you)</span>
                        )}
                      </div>
                      <div className="text-[10px] text-mute truncate">
                        @{r.username}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-mute">
                  {r.matchesPlayed}
                </td>
                {columns.map((c) => {
                  const v = (r as unknown as Record<ColumnKey, number>)[c.key];
                  return (
                    <td
                      key={c.key}
                      className={
                        "py-2 px-2 text-right font-mono tabular-nums " +
                        (v === 0 ? "text-mute/40" : "")
                      }
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="py-2 px-2 text-right font-mono tabular-nums text-accent">
                  {r.totalWins}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align,
  hint,
  accent,
  sticky,
}: {
  label: string;
  k: ColumnKey;
  sortKey: ColumnKey;
  sortDir: "asc" | "desc";
  onClick: () => void;
  align: "left" | "right";
  hint?: string;
  accent?: boolean;
  sticky?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th
      className={
        "font-medium uppercase tracking-wider text-[10px] py-2 px-2 align-bottom " +
        (align === "left" ? "text-left " : "text-right ") +
        (sticky ? "sticky left-0 bg-panel " : "") +
        (accent ? "text-accent " : "")
      }
      title={hint}
    >
      <button
        type="button"
        onClick={onClick}
        className={
          "inline-flex items-center gap-1 transition-colors " +
          (active ? "text-ink" : "hover:text-ink")
        }
      >
        <span>{label}</span>
        <span className="opacity-50 text-[8px]">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
      {hint && (
        <div
          className={
            "text-[9px] text-faint font-normal normal-case tracking-normal leading-tight mt-0.5 " +
            (align === "right" ? "text-right" : "text-left")
          }
        >
          {hint}
        </div>
      )}
    </th>
  );
}
