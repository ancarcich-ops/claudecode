import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listUserGroups } from "@/lib/groups";
import {
  createGroupAction,
  joinGroupAction,
  leaveGroupAction,
} from "@/lib/actions";
import CopyInvite from "@/components/CopyInvite";
import EmptyIllustration from "@/components/EmptyIllustration";

export const dynamic = "force-dynamic";

function Banner({ children, tone }: { children: React.ReactNode; tone: "ok" | "err" }) {
  const classes =
    tone === "ok"
      ? "border-accent/40 bg-accent/10 text-accent"
      : "border-danger/40 bg-danger/10 text-danger";
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${classes}`}>
      {children}
    </div>
  );
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: { error?: string; code?: string; joined?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groups = await listUserGroups(user.id);

  const banner = (() => {
    if (searchParams.joined) {
      const g = groups.find((x) => x.id === searchParams.joined);
      if (g) return { tone: "ok" as const, msg: `Joined ${g.name}.` };
      return null;
    }
    if (searchParams.error === "invalid") {
      const code = (searchParams.code ?? "").toUpperCase();
      return {
        tone: "err" as const,
        msg: `Invite code ${code || ""} doesn't match any group. Double-check the link.`,
      };
    }
    if (searchParams.error === "db") {
      return {
        tone: "err" as const,
        msg: "We had trouble reaching the database. Try the link again in a minute.",
      };
    }
    if (searchParams.error === "join") {
      return {
        tone: "err" as const,
        msg: "Something went wrong saving your membership. Try clicking the link again.",
      };
    }
    return null;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {banner && <Banner tone={banner.tone}>{banner.msg}</Banner>}
      <div>
        <h1 className="text-xl font-semibold mb-1">Groups</h1>
        <p className="text-sm text-mute">
          A group is a private feed. Matches you post to a group are only
          visible to other members. Share an invite code to add friends.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Your groups
        </h2>
        {groups.length === 0 ? (
          <EmptyIllustration
            kind="noGroups"
            title="No groups yet."
            body="Spin one up below or drop in an invite code from a friend."
          />
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:border-accent/40 transition-colors"
              >
                <Link
                  href={`/groups/${g.slug ?? g.id}`}
                  className="min-w-0 flex-1 -mx-1 -my-1 px-1 py-1 rounded"
                >
                  <div className="text-sm font-medium truncate">
                    {g.name}{" "}
                    <span className="text-mute text-xs font-normal">→</span>
                  </div>
                  <div className="text-xs text-mute">
                    {g._count.members} member{g._count.members === 1 ? "" : "s"}{" "}
                    · {g._count.matches} match
                    {g._count.matches === 1 ? "" : "es"}
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/groups/${g.slug ?? g.id}/leaderboard`}
                    className="btn btn-ghost text-xs px-2.5 py-1.5 whitespace-nowrap"
                    aria-label={`${g.name} leaderboard`}
                  >
                    Leaderboard →
                  </Link>
                  <CopyInvite code={g.inviteCode} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Create a group
        </h2>
        <form action={createGroupAction} className="flex gap-2">
          <input
            name="name"
            className="input flex-1 min-w-0"
            placeholder="Saturday foursome, College buddies, ..."
            maxLength={40}
            required
          />
          <button type="submit" className="btn btn-primary shrink-0">
            Create
          </button>
        </form>
        <p className="text-xs text-mute mt-2">
          You&apos;ll get an invite code to share. Anyone with the code can
          join.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Join with an invite code
        </h2>
        <form action={joinGroupAction} className="flex gap-2">
          <input
            name="inviteCode"
            className="input flex-1 min-w-0 font-mono uppercase tracking-widest"
            placeholder="ABC123"
            maxLength={12}
            required
            defaultValue={(searchParams.code ?? "").toUpperCase()}
          />
          <button type="submit" className="btn btn-primary shrink-0">
            Join
          </button>
        </form>
        <p className="text-xs text-mute mt-2">
          Ask a group member to share theirs &mdash; tap{" "}
          <span className="text-ink">Copy link</span> next to any group
          above and the code rides along with the URL.
        </p>
      </section>
    </div>
  );
}
