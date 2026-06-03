import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getTournamentById } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

// Placeholder detail page -- shows the tournament name, status, roster,
// and an empty rounds list. The real leaderboard + round creation
// flow ships in PR 3 and PR 4.
export default async function TournamentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tournament = await getTournamentById(params.id);
  if (!tournament) notFound();

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
        <h2 className="font-display text-base font-semibold text-ink mb-2">
          Leaderboard
        </h2>
        <p className="text-sm text-mute">
          Cumulative standings show up here once rounds start completing.
        </p>
      </section>
    </div>
  );
}
