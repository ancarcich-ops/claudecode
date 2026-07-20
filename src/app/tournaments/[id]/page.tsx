import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import {
  computeTournamentLeaderboard,
  getTournamentById,
} from "@/lib/tournaments";
import { computeTournamentWinOdds } from "@/lib/tournamentOdds";
import {
  completeTournamentAction,
  deleteTournamentAction,
} from "@/lib/actions";
import CopyInvite from "@/components/CopyInvite";
import TournamentBoardTabs from "@/components/TournamentBoardTabs";

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
  const [leaderboard, odds] = await Promise.all([
    computeTournamentLeaderboard(tournament.id),
    computeTournamentWinOdds(tournament.id),
  ]);

  const scheduleLabel = tournament.scheduledStartAt
    ? new Date(tournament.scheduledStartAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Schedule TBD";

  // Distinct round numbers seen across child matches. A round is
  // "complete" once at least one foursome reports a score and every
  // foursome that started it has finished. For the header we just
  // count fully-complete rounds.
  const matchesByRound = new Map<number, typeof tournament.matches>();
  for (const m of tournament.matches) {
    if (m.roundNumber == null) continue;
    const arr = matchesByRound.get(m.roundNumber) ?? [];
    arr.push(m);
    matchesByRound.set(m.roundNumber, arr);
  }
  const distinctRoundNumbers = Array.from(matchesByRound.keys()).sort(
    (a, b) => a - b,
  );
  const completedRounds = distinctRoundNumbers.filter((r) => {
    const matches = matchesByRound.get(r) ?? [];
    return matches.length > 0 && matches.every((m) => m.status === "COMPLETED");
  }).length;

  // Roster member key (userId for linked, lowercased displayName for
  // free-typed) for matching against per-match player rows.
  const meKey = user.id;
  const meInRoster = tournament.roster.some(
    (r) => r.userId === meKey,
  );

  // Render rounds 1..roundsPlanned plus any extras already started.
  const maxExistingRound = distinctRoundNumbers.length
    ? distinctRoundNumbers[distinctRoundNumbers.length - 1]
    : 0;
  const displayRounds = Array.from(
    { length: Math.max(tournament.roundsPlanned, maxExistingRound) },
    (_, i) => i + 1,
  );

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
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-display text-base font-semibold text-ink">
            Roster{" "}
            <span className="font-mono text-[11px] text-mute">
              {tournament.roster.length}
            </span>
          </h2>
          {tournament.createdById === user?.id && (
            <Link
              href={`/tournaments/${tournament.id}/teams`}
              className="btn btn-ghost text-xs whitespace-nowrap"
            >
              Form teams →
            </Link>
          )}
        </div>
        <ul className="space-y-1.5">
          {tournament.roster.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 text-sm rounded-md border border-border px-3 py-2"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate">{r.displayName}</span>
                  {r.team != null && (
                    <span className="chip text-[10px] shrink-0">
                      Team {r.team}
                    </span>
                  )}
                </span>
                {r.partnerName && (
                  <span className="block text-[11px] text-mute truncate">
                    wants: {r.partnerName}
                  </span>
                )}
              </span>
              <span className="font-mono text-[11px] text-mute shrink-0">
                {r.handicapAtStart != null
                  ? `HCP ${r.handicapAtStart.toFixed(1)}`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Rounds
          </h2>
        </div>
        {displayRounds.map((roundNo) => {
          const matches = matchesByRound.get(roundNo) ?? [];
          const meInThisRound = matches.some((m) =>
            m.players.some((p) => p.userId === meKey),
          );
          const canStartFoursome = meInRoster && !meInThisRound;
          return (
            <div key={roundNo} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-mono text-[11px] uppercase tracking-wider text-mute">
                  Round {roundNo}
                </h3>
                {canStartFoursome && (
                  <Link
                    href={`/matches/new?tournament=${tournament.id}&round=${roundNo}`}
                    className="btn btn-primary text-xs shrink-0"
                  >
                    Start your round →
                  </Link>
                )}
              </div>
              {matches.length === 0 ? (
                <p className="text-xs text-mute italic">
                  No foursomes yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {matches.map((m) => {
                    const youInIt = m.players.some(
                      (p) => p.userId === meKey,
                    );
                    return (
                      <li
                        key={m.id}
                        className={
                          "rounded-md border px-3 py-2 " +
                          (youInIt
                            ? "border-accent/40 bg-accent/[0.04]"
                            : "border-border")
                        }
                      >
                        <Link
                          href={`/matches/${m.id}`}
                          className="block space-y-0.5"
                        >
                          <div className="flex items-baseline justify-between gap-2 flex-wrap">
                            <div className="text-sm font-medium truncate">
                              {m.courseName}
                              {youInIt && (
                                <span className="ml-1.5 text-[10px] text-accent uppercase tracking-wider font-mono">
                                  your foursome
                                </span>
                              )}
                            </div>
                            <span
                              className={
                                "text-[10px] font-mono uppercase tracking-wider " +
                                (m.status === "COMPLETED"
                                  ? "text-accent"
                                  : m.status === "IN_PROGRESS"
                                    ? "text-gold"
                                    : "text-mute")
                              }
                            >
                              {m.status === "COMPLETED"
                                ? "Final"
                                : m.status === "IN_PROGRESS"
                                  ? "Live"
                                  : "Upcoming"}
                            </span>
                          </div>
                          <div className="text-[11px] text-mute truncate">
                            {m.players.map((p) => p.displayName).join(" · ")}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-3 gap-2">
          <h2 className="font-display text-base font-semibold text-ink">
            Standings
          </h2>
          <span className="text-[11px] text-mute">
            {tournament.scoringMode === "GROSS"
              ? "Sum of gross strokes"
              : "Sum of net (gross − handicap)"}
          </span>
        </div>
        {completedRounds === 0 && odds.length === 0 ? (
          <p className="text-sm text-mute">
            Standings show up here once the first round wraps. Every roster
            player gets a row; players who miss rounds show DNP and sink to
            the bottom.
          </p>
        ) : (
          <TournamentBoardTabs
            leaderboardRows={leaderboard}
            oddsRows={odds}
            roundCount={distinctRoundNumbers.length}
            scoringMode={tournament.scoringMode}
          />
        )}
      </section>

      {tournament.createdById === user.id &&
        tournament.status !== "COMPLETED" && (
          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink mb-2">
              Finish tournament
            </h2>
            <p className="text-xs text-mute mb-3">
              Marks the tournament settled with the current leaderboard
              as the final standings. Use this when you&apos;re done early
              (e.g. only played 1 of 3 planned rounds). Moves it out of
              the active section on the home page.
            </p>
            <form action={completeTournamentAction}>
              <input type="hidden" name="tournamentId" value={tournament.id} />
              <button type="submit" className="btn btn-primary text-xs">
                Finish {tournament.name}
              </button>
            </form>
          </section>
        )}

      {tournament.createdById === user.id && (
        <section className="card p-5">
          <h2 className="font-display text-base font-semibold text-ink mb-2">
            Delete tournament
          </h2>
          <p className="text-xs text-mute mb-3">
            Removes the tournament, roster, and leaderboard. Any rounds
            that were played stay on the home feed as standalone matches.
          </p>
          <form action={deleteTournamentAction}>
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <button type="submit" className="btn btn-danger text-xs">
              Delete {tournament.name}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

