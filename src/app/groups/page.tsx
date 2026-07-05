// Groups page -- redesigned per the "Groups Redesign" handoff
// (Caddie's Notebook). Title + lede, section header with a mono count,
// spine-colored group cards with a Leaderboard/invite-ticket footer,
// then the Create and Join action cards. The site-wide app bar and
// bottom tab bar are shared chrome and stay as they are.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listUserGroups } from "@/lib/groups";
import GroupCard from "@/components/GroupCard";
import {
  CreateGroupCard,
  JoinGroupCard,
} from "@/components/GroupsActionCards";
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
    <div className="mx-auto max-w-2xl">
      {banner && <div className="mb-5"><Banner tone={banner.tone}>{banner.msg}</Banner></div>}

      <h1 className="font-display text-[40px] font-bold tracking-[-0.02em] leading-none text-ink">
        Groups
      </h1>
      <p className="text-[14.5px] leading-normal text-mute mt-2.5 max-w-[34ch]">
        A group is a private feed. Matches you post are seen only by
        members. Share an invite code to add friends.
      </p>

      <div className="flex items-baseline justify-between mt-[30px] mb-[13px] px-0.5">
        <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-ink whitespace-nowrap">
          Your groups
        </h2>
        <span className="font-mono text-[12px] tracking-[0.04em] uppercase text-faint">
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </span>
      </div>

      {groups.length === 0 ? (
        <section className="rounded-[16px] border border-border bg-panel p-5">
          <EmptyIllustration
            kind="noGroups"
            title="No groups yet."
            body="Spin one up below or drop in an invite code from a friend."
          />
        </section>
      ) : (
        <div className="space-y-[13px]">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              id={g.id}
              name={g.name}
              slug={g.slug}
              inviteCode={g.inviteCode}
              memberCount={g._count.members}
              matchCount={g._count.matches}
              memberNames={g.members.map(
                (m) => m.user.displayName || m.user.username,
              )}
            />
          ))}
        </div>
      )}

      <div className="mt-[14px] space-y-[14px]">
        <CreateGroupCard />
        <JoinGroupCard initialCode={searchParams.code} />
      </div>
    </div>
  );
}
