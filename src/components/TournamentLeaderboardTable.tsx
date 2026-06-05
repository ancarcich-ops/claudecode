// Cumulative tournament leaderboard table. Used by /tournaments/[id]
// and inline on the home page so anyone viewing an active tournament
// from the feed sees standings without an extra tap.
//
// Rows ranked by `total` (lower wins) with ties drawn at the same
// rank. Per-round columns show the score when the round completed and
// the player took part, `—` for skipped rounds, blank for rounds that
// haven't finished yet.

import type { LeaderboardRow } from "@/lib/tournaments";

export default function TournamentLeaderboardTable({
  rows,
  roundCount,
  scoringMode,
}: {
  rows: Pick<
    LeaderboardRow,
    "rank" | "displayName" | "latestHandicap" | "roundScores" | "total"
  >[];
  roundCount: number;
  scoringMode: string;
}) {
  const roundHeaders = Array.from({ length: roundCount }, (_, i) => i + 1);
  const totalLabel = scoringMode === "GROSS" ? "Gross" : "Net";
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="text-[11px] font-mono tabular-nums w-full">
        <thead>
          <tr className="bg-panel2/60 text-mute">
            <th className="text-left px-2 py-1.5 font-medium uppercase tracking-wider w-8">
              #
            </th>
            <th className="text-left px-2 py-1.5 font-medium uppercase tracking-wider">
              Player
            </th>
            {roundHeaders.map((n) => (
              <th
                key={n}
                className="px-2 py-1.5 text-center font-medium uppercase tracking-wider"
              >
                R{n}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right text-ink font-medium uppercase tracking-wider">
              {totalLabel}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => {
            const isLeader = r.rank === 1;
            return (
              <tr key={r.displayName} className={isLeader ? "bg-gold/[0.06]" : ""}>
                <td
                  className={
                    "px-2 py-2 text-left " +
                    (isLeader ? "text-gold font-semibold" : "text-mute")
                  }
                >
                  {r.rank}
                </td>
                <td className="px-2 py-2 text-left text-ink font-sans">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={isLeader ? "font-medium" : ""}>
                      {r.displayName}
                    </span>
                    {r.latestHandicap != null && (
                      <span className="text-[10px] text-mute font-mono">
                        HCP {r.latestHandicap.toFixed(1)}
                      </span>
                    )}
                  </div>
                </td>
                {r.roundScores.map((s, i) => (
                  <td
                    key={i}
                    className={
                      "px-2 py-2 text-center " +
                      (s == null ? "text-faint" : "text-ink")
                    }
                  >
                    {s == null ? "—" : s}
                  </td>
                ))}
                <td
                  className={
                    "px-2 py-2 text-right " +
                    (isLeader ? "text-gold font-semibold" : "text-ink font-medium")
                  }
                >
                  {r.total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="px-3 py-4 text-sm text-mute text-center">
          No scores yet.
        </div>
      )}
    </div>
  );
}
