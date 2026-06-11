// Tournament win-odds table. Sister component to
// TournamentLeaderboardTable -- same row shape (player + handicap +
// score-so-far), but rank/sort is by win probability rather than
// cumulative score, and the final column is a Win% number plus a
// horizontal "market bar" sized to the probability.
//
// For a COMPLETED tournament the bars collapse to 100% on the winner
// (matches what the leaderboard already shows).

import { formatPct } from "@/lib/odds";
import type { TournamentOddsRow } from "@/lib/tournamentOdds";

export default function TournamentOddsTable({
  rows,
  roundCount,
  scoringMode,
}: {
  rows: TournamentOddsRow[];
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
            <th className="px-2 py-1.5 text-right font-medium uppercase tracking-wider">
              {totalLabel}
            </th>
            <th className="px-2 py-1.5 text-right text-ink font-medium uppercase tracking-wider">
              Win
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => {
            const isFav = r.rank === 1;
            const pct = Math.round(r.winProbability * 100);
            return (
              <tr key={r.displayName} className={isFav ? "bg-gold/[0.06]" : ""}>
                <td
                  className={
                    "px-2 py-2 text-left " +
                    (isFav ? "text-gold font-semibold" : "text-mute")
                  }
                >
                  {r.rank}
                </td>
                <td className="px-2 py-2 text-left text-ink font-sans">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={isFav ? "font-medium" : ""}>
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
                    (isFav ? "text-gold font-semibold" : "text-ink font-medium")
                  }
                >
                  {r.playedRounds === 0 ? "—" : r.scoreSoFar}
                </td>
                <td
                  className={
                    "px-2 py-2 text-right tabular-nums " +
                    (isFav ? "text-gold font-semibold" : "text-ink")
                  }
                >
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1.5 rounded-full bg-panel2 overflow-hidden">
                      <div
                        className={
                          "h-full " + (isFav ? "bg-gold/80" : "bg-accent/70")
                        }
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <span className="w-9 text-right">{formatPct(r.winProbability)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="px-3 py-4 text-sm text-mute text-center">
          No roster yet.
        </div>
      )}
    </div>
  );
}
