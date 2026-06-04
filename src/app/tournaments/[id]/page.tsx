import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import {
  computeTournamentLeaderboard,
  getTournamentById,
} from "@/lib/tournaments";
import CopyInvite from "@/components/CopyInvite";

export const dynamic = "force-dynamic";

export default async function TournamentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tournament = await getTournamentById(params.id);
  if (!tournament) notFound();
  const leaderboard = await computeTournamentLeaderboard(tournament.id);

  const scheduleLabel = tournament.scheduledStartAt
    ? new Date(tournament.scheduledStartAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Schedule TBD";

  const completedRounds = tournament.matches.filter(
    (m) => m.status === "COMPLETED",
  ).length;
  const nextRoundNumber = tournament.matches.reduce(
    (m, r) => Math.max(m, r.roundNumber ?? 0),
    0,
  ) + 1;
  const canStartAnotherRound = tournament.status !== "COMPLETED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        {tournament.group && (
          <Link
            href={`/groups/${tournament.group.slug ?? tournament.group.id}`}
            className="text-xs text-mute hover:text-ink"
          >
            ← {tournament.group.name}
          </Link>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight mt-1">
          {tournament.name}
        </h1>
        <p className="text-sm text-mute mt-1 flex items-center gap-2 flex-wrap">
          <span className="chip text-[10px]">
            {tournament.scoringMode === "GROSS" ? "Gross" : "Net"}
          </span>
          <span>
            {completedRounds}/{tournament.roundsPlanned} rounds played
          </span>
          <span aria-hidden>·</span>
          <span>{scheduleLabel}</span>
        </p>
      </div>

      {tournament.inviteCode && (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">
                Invite
              </h2>
              <p className="text-xs text-mute">
                Anyone with this code can join. Share the link to skip the
                manual code entry.
              </p>
            </div>
            <CopyInvite
              code={tournament.inviteCode}
              joinPath="/tournaments/join"
            />
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Roster
        </h2>
        <ul className="space-y-1.5">
          {tournament.roster.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 text-sm rounded-md border border-border px-3 py-2"
            >
              <span>{r.displayName}</span>
              <span className="font-mono text-[11px] text-mute shrink-0">
                {r.handicapAtStart != null
                  ? `HCP ${r.handicapAtStart.toFixed(1)}`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-base font-semibold text-ink">
            Rounds
          </h2>
          {canStartAnotherRound && (
            <Link
              href={`/matches/new?tournament=${tournament.id}`}
              className="btn btn-primary text-xs shrink-0"
            >
              Start round {nextRoundNumber} →
            </Link>
          )}
        </div>
        {tournament.matches.length === 0 ? (
          <p className="text-sm text-mute">
            No rounds yet. Tap &ldquo;Start round 1&rdquo; to pick a course and
            kick the tournament off.
          </p>
        ) : (
          <ul className="space-y-2">
            {tournament.matches.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    Round {m.roundNumber} · {m.courseName}
                  </div>
                  <div className="text-[11px] text-mute">
                    {new Date(m.scheduledAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" · "}
                    <span
                      className={
                        m.status === "COMPLETED"
                          ? "text-accent"
                          : m.status === "IN_PROGRESS"
                            ? "text-gold"
                            : "text-mute"
                      }
                    >
                      {m.status === "COMPLETED"
                        ? "Final"
                        : m.status === "IN_PROGRESS"
                          ? "Live"
                          : "Upcoming"}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/matches/${m.id}`}
                  className="btn btn-ghost text-xs shrink-0"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-3 gap-2">
          <h2 className="font-display text-base font-semibold text-ink">
            Leaderboard
          </h2>
          <span className="text-[11px] text-mute">
            {tournament.scoringMode === "GROSS"
              ? "Sum of gross strokes"
              : "Sum of net (gross − handicap)"}
          </span>
        </div>
        {completedRounds === 0 ? (
          <p className="text-sm text-mute">
            Standings show up here once the first round wraps. Every roster
            player gets a row; players who miss rounds show DNP and sink to
            the bottom.
          </p>
        ) : (
          <LeaderboardTable
            rows={leaderboard}
            roundCount={
              tournament.matches.filter((m) => m.roundNumber != null).length
            }
            scoringMode={tournament.scoringMode}
          />
        )}
      </section>
    </div>
  );
}

// Cumulative leaderboard. Players ranked by total (lower wins) with
// ties drawn at the same rank. Per-round scores show numerically when
// the round is complete and the player took part, `—` for rounds the
// player skipped, blank for rounds that haven't finished yet.
function LeaderboardTable({
  rows,
  roundCount,
  scoringMode,
}: {
  rows: {
    rank: number;
    displayName: string;
    latestHandicap: number | null;
    roundScores: (number | null)[];
    total: number;
    playedRounds: number;
  }[];
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
