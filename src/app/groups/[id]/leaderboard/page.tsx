// Group leaderboard -- redesigned per the "Leaderboard Redesign"
// handoff: mono back link, 38px display title, bold-count lede, then
// the client sections (Latest winners, medal-ranked sortable
// standings, sticky-column head-to-head, streaks, course records).

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findGroupByIdOrSlug } from "@/lib/groups";
import { computeGroupLeaderboard } from "@/lib/leaderboard";
import LeaderboardRedesign from "./LeaderboardRedesign";
import EmptyIllustration from "@/components/EmptyIllustration";

export const dynamic = "force-dynamic";

export default async function GroupLeaderboardPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const resolved = await findGroupByIdOrSlug(params.id);
  if (!resolved) notFound();
  const group = await prisma.group.findUnique({
    where: { id: resolved.id },
    select: {
      id: true,
      name: true,
      slug: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!group) notFound();
  if (group.members.length === 0) notFound();

  const lb = await computeGroupLeaderboard(group.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/groups/${group.slug ?? group.id}`}
        className="inline-flex items-center gap-1.5 font-mono text-[11.5px] tracking-[0.1em] uppercase text-accent hover:text-accentDim"
      >
        <span aria-hidden>←</span> {group.name}
      </Link>
      <h1 className="font-display text-[38px] font-bold tracking-[-0.02em] leading-tight text-ink mt-1">
        Leaderboard
      </h1>
      <p className="text-[13.5px] text-mute mt-1.5">
        {lb.completedMatches === 0 ? (
          "No completed matches yet. Wins start counting once rounds wrap up."
        ) : (
          <>
            <span className="text-ink font-semibold">
              {lb.completedMatches} completed match
              {lb.completedMatches === 1 ? "" : "es"}.
            </span>{" "}
            Ties at the top of any game share the win.
          </>
        )}
      </p>

      {lb.completedMatches === 0 ? (
        <div className="mt-6">
          <EmptyIllustration
            kind="noLeaderboard"
            title="No closed lines yet."
            body="Once a match in this group wraps up, wins start posting here."
          />
        </div>
      ) : (
        <LeaderboardRedesign
          rows={lb.rows}
          headToHead={lb.headToHead}
          champions={lb.champions}
          streaks={lb.streaks}
          courseRecords={lb.courseRecords}
        />
      )}
    </div>
  );
}
