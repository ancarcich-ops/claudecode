import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { leaveGroupAction } from "@/lib/actions";
import { findGroupByIdOrSlug } from "@/lib/groups";
import { listTournamentsForGroup } from "@/lib/tournaments";
import CopyInvite from "@/components/CopyInvite";
import PlayerAvatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Resolve cuid or slug. findGroupByIdOrSlug lazy-backfills the slug
  // for legacy rows so links from this page are pretty.
  const resolved = await findGroupByIdOrSlug(params.id);
  if (!resolved) notFound();
  const group = await prisma.group.findUnique({
    where: { id: resolved.id },
    include: {
      members: {
        orderBy: { joinedAt: "asc" },
        include: { user: true },
      },
      _count: { select: { matches: true } },
    },
  });

  if (!group) notFound();

  // Membership gate: non-members get a 404 rather than a "not allowed" page
  // so the group's existence isn't leaked.
  const me = group.members.find((m) => m.userId === user.id);
  if (!me) notFound();

  const matchCount = group._count.matches;

  const tournaments = await listTournamentsForGroup(group.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/groups" className="text-xs text-mute hover:text-ink">
          ← All groups
        </Link>
        <div className="flex items-start justify-between gap-3 mt-1">
          <h1 className="text-xl font-semibold flex-1 min-w-0 truncate">
            {group.name}
          </h1>
          <Link
            href={`/groups/${group.slug ?? group.id}/leaderboard`}
            className="btn btn-ghost text-xs whitespace-nowrap shrink-0"
          >
            Leaderboard →
          </Link>
        </div>
        <p className="text-sm text-mute mt-1">
          {group.members.length} member
          {group.members.length === 1 ? "" : "s"} · {matchCount} match
          {matchCount === 1 ? "" : "es"}
        </p>
      </div>

      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-ink">
            Invite
          </h2>
          <CopyInvite code={group.inviteCode} />
        </div>
        <p className="text-xs text-mute">
          Anyone with this code can join. Share the link to skip the manual
          code entry.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Members
        </h2>
        <ul className="space-y-2">
          {group.members.map((m) => {
            const displayName =
              m.user?.displayName ?? m.user?.username ?? "Unknown";
            const isYou = m.userId === user.id;
            const username = m.user?.username ?? null;
            // Avatar + name block. Clicking a member opens their read-only
            // stats page (/u/[username]) -- course history, index trend,
            // etc. That page hides the owner-only management surfaces
            // (round delete, GHIN editor) and redirects a self-view to the
            // editable /stats, so nobody can edit anyone else's rounds.
            const memberInner = (
              <>
                <PlayerAvatar
                  seed={m.user?.avatarSeed ?? m.user?.username ?? m.userId}
                  variant={
                    (m.user?.avatarVariant as
                      | "beam"
                      | "marble"
                      | "sunset"
                      | "pixel"
                      | "ring"
                      | "bauhaus"
                      | undefined) ?? "beam"
                  }
                  avatarUrl={m.user?.avatarUrl ?? null}
                  size={32}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {displayName}
                    {isYou && (
                      <span className="text-mute font-normal"> (you)</span>
                    )}
                  </div>
                  <div className="text-xs text-mute">
                    @{m.user?.username ?? "—"} ·{" "}
                    {new Date(m.joinedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </>
            );
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                {username ? (
                  <Link
                    href={`/u/${username}`}
                    className="flex items-center gap-3 min-w-0 rounded-md -mx-1 px-1 py-0.5 hover:bg-panel2/60 transition-colors"
                  >
                    {memberInner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 min-w-0">
                    {memberInner}
                  </div>
                )}
                {m.role === "owner" && (
                  <span className="chip text-xs shrink-0">Owner</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-base font-semibold text-ink">
            Tournaments
          </h2>
          <Link
            href={`/tournaments/new?group=${group.id}`}
            className="btn btn-ghost text-xs whitespace-nowrap shrink-0"
          >
            + New tournament
          </Link>
        </div>
        {tournaments.length === 0 ? (
          <p className="text-xs text-mute">
            No tournaments yet. Bundle a couple of matches into a multi-round
            event with a cumulative leaderboard.
          </p>
        ) : (
          <ul className="space-y-2">
            {tournaments.map((t) => {
              const completed = t.matches.filter(
                (m) => m.status === "COMPLETED",
              ).length;
              return (
                <li
                  key={t.id}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.name}
                      </div>
                      <div className="text-[11px] text-mute">
                        {t.scoringMode === "GROSS" ? "Gross" : "Net"} ·{" "}
                        {t.roster.length} player
                        {t.roster.length === 1 ? "" : "s"} · {completed}/
                        {t.roundsPlanned} rounds
                      </div>
                    </div>
                    <span className="chip text-[10px] shrink-0">
                      {t.status === "COMPLETED"
                        ? "Final"
                        : t.status === "IN_PROGRESS"
                          ? "Live"
                          : "Upcoming"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Leave group
        </h2>
        <p className="text-xs text-mute mb-3">
          You&apos;ll stop seeing this group&apos;s matches. You can rejoin
          later with the invite code.
        </p>
        <form action={leaveGroupAction}>
          <input type="hidden" name="groupId" value={group.id} />
          <button type="submit" className="btn btn-danger text-xs">
            Leave {group.name}
          </button>
        </form>
      </section>
    </div>
  );
}
