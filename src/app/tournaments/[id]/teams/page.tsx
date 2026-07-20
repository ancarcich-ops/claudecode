import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { disbandTournamentTeamAction } from "@/lib/actions";
import TeamBuilder from "./TeamBuilder";

export const dynamic = "force-dynamic";

export default async function TournamentTeamsPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      createdById: true,
      roster: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          displayName: true,
          handicapAtStart: true,
          partnerName: true,
          team: true,
        },
      },
    },
  });
  if (!tournament) notFound();
  // Team formation is organizer-only.
  if (tournament.createdById !== user.id) redirect(`/tournaments/${params.id}`);

  const roster = tournament.roster;
  const unassigned = roster.filter((r) => r.team == null);
  const teamsMap = new Map<number, typeof roster>();
  for (const r of roster) {
    if (r.team == null) continue;
    const arr = teamsMap.get(r.team) ?? [];
    arr.push(r);
    teamsMap.set(r.team, arr);
  }
  const teams = Array.from(teamsMap.entries()).sort((a, b) => a[0] - b[0]);
  const paired = roster.length - unassigned.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/tournaments/${tournament.id}`}
          className="text-[12px] text-mute hover:text-ink"
        >
          ← {tournament.name}
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight mt-1">
          Form teams
        </h1>
        <p className="text-sm text-mute mt-1">
          2-man best ball. Pair players into teams — each player&rsquo;s
          sign-up preference is shown as a hint.{" "}
          <span className="text-ink font-medium">
            {teams.length} team{teams.length === 1 ? "" : "s"}
          </span>{" "}
          · {paired}/{roster.length} players paired.
        </p>
      </div>

      {/* Formed teams */}
      {teams.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-base font-semibold text-ink mb-3">
            Teams
          </h2>
          <div className="space-y-2">
            {teams.map(([teamNo, members]) => (
              <div
                key={teamNo}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-panel2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
                    Team {teamNo}
                  </div>
                  <div className="font-medium text-ink truncate">
                    {members.map((m) => m.displayName).join("  +  ")}
                    {members.length === 1 && (
                      <span className="text-danger text-[12px]">
                        {" "}
                        (needs a partner)
                      </span>
                    )}
                  </div>
                </div>
                <form action={disbandTournamentTeamAction} className="shrink-0">
                  <input type="hidden" name="tournamentId" value={tournament.id} />
                  <input type="hidden" name="team" value={teamNo} />
                  <button
                    type="submit"
                    className="text-[12px] text-mute hover:text-danger"
                  >
                    Disband
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unassigned pool + pairing */}
      <section className="card p-4">
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Unassigned{" "}
          <span className="font-mono text-[11px] text-mute">
            {unassigned.length}
          </span>
        </h2>
        <TeamBuilder
          unassigned={unassigned.map((r) => ({
            id: r.id,
            displayName: r.displayName,
            handicap: r.handicapAtStart,
            partnerName: r.partnerName,
          }))}
        />
      </section>
    </div>
  );
}
