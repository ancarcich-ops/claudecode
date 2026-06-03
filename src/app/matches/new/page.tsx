import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createMatchAction } from "@/lib/actions";
import { COURSE_PRESETS } from "@/lib/courses";
import { getActiveGroupId, listUserGroups } from "@/lib/groups";
import { computeUserStats } from "@/lib/userStats";
import { isSideGameKind, type SideGameKind } from "@/lib/sideGames";
import NewMatchForm, { type MatchTemplate } from "./NewMatchForm";

export const dynamic = "force-dynamic";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: { tournament?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Tournament round mode. When ?tournament=<id> is in the URL we
  // load the tournament + roster, lock the group dropdown to the
  // tournament's group, and pre-fill the players. createMatchAction
  // honors the hidden tournamentId field and binds the new match to
  // round N (auto-computed if roundNumber isn't passed).
  const tournament = searchParams.tournament
    ? await prisma.tournament.findUnique({
        where: { id: searchParams.tournament },
        include: {
          roster: { orderBy: { createdAt: "asc" } },
          matches: { select: { roundNumber: true } },
        },
      })
    : null;
  const nextRoundNumber = tournament
    ? tournament.matches.reduce(
        (m, r) => Math.max(m, r.roundNumber ?? 0),
        0,
      ) + 1
    : null;

  const recent = await prisma.match.findMany({
    where: { createdById: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      courseName: true,
      scheduledAt: true,
      holes: true,
      startingHole: true,
      scoringMode: true,
      players: {
        orderBy: { seat: "asc" },
        select: {
          displayName: true,
          handicap: true,
          userId: true,
        },
      },
      sideGames: { select: { kind: true } },
    },
  });
  const recentCourses = Array.from(
    new Set(recent.map((r) => r.courseName)),
  ).slice(0, 12);

  // Templates: every recent round is a one-tap clone of its setup
  // (course + holes + scoring + players + side games). De-dupe on the
  // signature so playing the same foursome twice doesn't show up twice.
  const seenSig = new Set<string>();
  const templates: MatchTemplate[] = [];
  for (const r of recent) {
    const playerNames = r.players.map((p) => p.displayName).join("|");
    const sig = `${r.courseName}|${r.holes}|${r.startingHole}|${r.scoringMode}|${playerNames}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    const sideGames: SideGameKind[] = r.sideGames
      .map((sg) => sg.kind)
      .filter(isSideGameKind);
    templates.push({
      id: r.id,
      courseName: r.courseName,
      scheduledAt: r.scheduledAt.toISOString(),
      holes: r.holes as 9 | 18,
      startingHole: (r.startingHole === 10 ? 10 : 1) as 1 | 10,
      scoringMode:
        r.scoringMode === "GROSS" || r.scoringMode === "CUSTOM"
          ? r.scoringMode
          : "NET",
      players: r.players.map((p) => ({
        name: p.displayName,
        handicap: String(p.handicap),
        userId: p.userId,
      })),
      sideGames,
    });
    if (templates.length >= 8) break;
  }

  const defaultName =
    user.displayName ??
    user.username.charAt(0).toUpperCase() + user.username.slice(1);

  // Pre-fill the creator's handicap with their auto-computed Sticks index
  // when available. Falls back to the historical default of "12" so the
  // form never lands empty.
  const userStats = await computeUserStats(user.id);
  // Don't fake a default when the user hasn't logged enough rounds for an
  // index -- leave the field blank so the creator types something explicit,
  // and pass a pending flag down so the form can label why.
  const userHandicapPending = !userStats?.handicap;
  const defaultHandicap = userHandicapPending
    ? ""
    : userStats!.handicap!.index.toFixed(1);

  const groups = await listUserGroups(user.id);
  const activeGroup = getActiveGroupId();
  // Default the form to the user's currently-selected group if it's a real
  // group they belong to; otherwise "public".
  const defaultGroupId =
    activeGroup && activeGroup !== "public" &&
    groups.some((g) => g.id === activeGroup)
      ? activeGroup
      : "public";

  // When this is a tournament round, override the default group + roster
  // and surface the tournament header so the user knows what they're
  // creating.
  const resolvedDefaultGroupId = tournament
    ? tournament.groupId ?? "public"
    : defaultGroupId;
  const prefilledPlayers = tournament
    ? tournament.roster.map((r) => ({
        name: r.displayName,
        handicap:
          r.handicapAtStart != null ? r.handicapAtStart.toFixed(1) : "",
        userId: r.userId,
      }))
    : undefined;
  const hiddenFields = tournament
    ? {
        tournamentId: tournament.id,
        roundNumber: String(nextRoundNumber ?? 1),
      }
    : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      {tournament ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
            Round {nextRoundNumber} · {tournament.name}
          </h1>
          <p className="text-sm text-mute mb-6">
            Same roster, your course pick. Score rolls into the cumulative
            standings.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
            Open the line.
          </h1>
          <p className="text-sm text-mute mb-6">
            Course, tee time, players. Odds move the second you publish.
          </p>
        </>
      )}
      <NewMatchForm
        action={createMatchAction}
        defaultPlayerName={defaultName}
        defaultPlayerHandicap={defaultHandicap}
        userHandicapPending={userHandicapPending}
        currentUserId={user.id}
        recentCourses={recentCourses}
        presets={COURSE_PRESETS}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        defaultGroupId={resolvedDefaultGroupId}
        templates={templates}
        prefilledPlayers={prefilledPlayers}
        hiddenFields={hiddenFields}
        submitLabel={
          tournament ? `Start round ${nextRoundNumber} →` : undefined
        }
      />
    </div>
  );
}
