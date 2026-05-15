import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { leaveGroupAction } from "@/lib/actions";
import CopyInvite from "@/components/CopyInvite";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const group = await prisma.group.findUnique({
    where: { id: params.id },
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
            href={`/groups/${group.id}/leaderboard`}
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
          <h2 className="text-sm uppercase tracking-wider text-mute">
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
        <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
          Members
        </h2>
        <ul className="space-y-2">
          {group.members.map((m) => {
            const displayName =
              m.user?.displayName ?? m.user?.username ?? "Unknown";
            const isYou = m.userId === user.id;
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
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
                {m.role === "owner" && (
                  <span className="chip text-xs shrink-0">Owner</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
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
