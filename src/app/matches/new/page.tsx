import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createMatchAction } from "@/lib/actions";
import { COURSE_PRESETS } from "@/lib/courses";
import { getActiveGroupId, listUserGroups } from "@/lib/groups";
import { computeUserStats } from "@/lib/userStats";
import { isSideGameKind, type SideGameKind } from "@/lib/sideGames";
import NewMatchForm, { type MatchTemplate } from "./NewMatchForm";
import { BIRDIE_BOYS } from "@/lib/birdieBoys";

export const dynamic = "force-dynamic";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: { tournament?: string; round?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Tournament foursome mode. When ?tournament=<id> is in the URL we
  // load the tournament + roster + existing matches (with their
  // players) so the form can surface a roster picker and avoid
  // double-booking players across foursomes in the same round.
  // ?round=N pins a specific round; otherwise we default to the
  // highest round in flight (or 1 for a fresh tournament).
  const tournament = searchParams.tournament
    ? await prisma.tournament.findUnique({
        where: { id: searchParams.tournament },
        include: {
          roster: { orderBy: { createdAt: "asc" } },
          matches: {
            select: {
              id: true,
              roundNumber: true,
              players: {
                select: { displayName: true, userId: true },
              },
            },
          },
        },
      })
    : null;
  const requestedRound = (() => {
    const raw = parseInt(searchParams.round ?? "", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  })();
  const currentRoundNumber = tournament
    ? requestedRound ??
      Math.max(
        1,
        tournament.matches.reduce(
          (m, r) => Math.max(m, r.roundNumber ?? 0),
          0,
        ),
      )
    : null;

  // Players already booked in another foursome for THIS round. We
  // exclude them from the available-roster picker so two captains
  // can't accidentally claim the same player.
  const bookedInThisRound = new Set<string>();
  if (tournament && currentRoundNumber != null) {
    for (const m of tournament.matches) {
      if (m.roundNumber !== currentRoundNumber) continue;
      for (const p of m.players) {
        bookedInThisRound.add(
          p.userId ?? `name:${p.displayName.toLowerCase()}`,
        );
      }
    }
  }
  // Available roster: anyone in the tournament who isn't the creator
  // (creator gets the default first seat) and isn't already booked.
  const availableRoster = tournament
    ? tournament.roster
        .filter((r) => r.userId !== user.id)
        .filter(
          (r) =>
            !bookedInThisRound.has(
              r.userId ?? `name:${r.displayName.toLowerCase()}`,
            ),
        )
        .map((r) => ({
          name: r.displayName,
          userId: r.userId,
          handicap:
            r.handicapAtStart != null ? r.handicapAtStart.toFixed(1) : "",
        }))
    : undefined;

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

  // When the user is starting a tournament foursome, seed only their
  // own seat (other roster members come in via the picker), and
  // inject tournamentId + roundNumber as hidden fields.
  const resolvedDefaultGroupId = tournament
    ? tournament.groupId ?? "public"
    : defaultGroupId;
  const prefilledPlayers = tournament
    ? [
        {
          name: defaultName,
          handicap: defaultHandicap,
          userId: user.id,
        },
      ]
    : undefined;
  const hiddenFields = tournament
    ? {
        tournamentId: tournament.id,
        roundNumber: String(currentRoundNumber ?? 1),
      }
    : undefined;
  // Pin the tournament's venue so the round opens on it directly. Falls
  // back to Goose Creek for the Birdie Boys tournament even if the
  // courseName column wasn't backfilled on that row yet.
  const defaultCourseName =
    tournament?.courseName ??
    (tournament?.slug === BIRDIE_BOYS.slug ? BIRDIE_BOYS.venue : undefined);

  return (
    <div className="mx-auto max-w-2xl">
      {tournament ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
            Round {currentRoundNumber} · {tournament.name}
          </h1>
          <p className="text-sm text-mute mb-6">
            {defaultCourseName
              ? `${defaultCourseName} is loaded — pull your foursome from the tournament roster and start. `
              : "Pick your course and pull your foursome from the tournament roster. "}
            Score rolls into the cumulative standings.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
            Open the line.
          </h1>
          <p className="text-sm text-mute mb-1">
            Course, tee time, players. Odds move the second you publish.
          </p>
          <p className="text-[11px] text-mute mb-6">
            Stringing rounds together or playing with a large group?{" "}
            <Link
              href="/tournaments/new"
              className="text-accent hover:underline"
            >
              Start a tournament here →
            </Link>
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
        availableRosterPlayers={availableRoster}
        defaultCourseName={defaultCourseName}
        submitLabel={
          tournament ? `Start round →` : undefined
        }
      />
    </div>
  );
}
