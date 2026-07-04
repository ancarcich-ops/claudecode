// GET /api/mobile/matches/:id
// Auth: Bearer token (must be the creator or a seated player).
// The one-call payload the on-course native client needs: match meta,
// per-hole pars, every player's scores + avatar, win probabilities,
// side-game leaderboards, and the course geometry
// (tee/green/front/back/polygons) plus hazards keyed by hole.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { loadMatchWithOdds } from "@/lib/match";
import { computeSideGameSectionsForMatch } from "@/lib/sideGameSections";
import {
  getCourseHolesByName,
  getCourseHazardsByName,
} from "@/lib/course";
import { getWindForCoord } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const loaded = await loadMatchWithOdds(params.id);
  if (!loaded) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  const { match, odds, pars } = loaded;
  const isCreator = match.createdById === user.id;
  const isSeated = match.players.some((p) => p.userId === user.id);
  if (!isCreator && !isSeated) {
    return NextResponse.json({ error: "Not your match" }, { status: 403 });
  }

  // Win probabilities keyed by matchPlayerId. Scramble matches price
  // teams ("team-0"/"team-1"); mirror each team's probability onto its
  // players -- same rule as recordOddsSnapshot.
  const isScramble = match.format === "SCRAMBLE";
  const probabilities = Object.fromEntries(
    match.players.map((p) => {
      const prob = isScramble
        ? p.team === 0 || p.team === 1
          ? odds.probabilities[`team-${p.team}`] ?? 0
          : 0
        : odds.probabilities[p.id] ?? 0;
      return [p.id, prob];
    }),
  );

  // Side-game leaderboards -- identical assembly to the web match page.
  const sideGames = computeSideGameSectionsForMatch(match, pars);

  const [holeGeo, hazards, course] = await Promise.all([
    getCourseHolesByName(match.courseName),
    getCourseHazardsByName(match.courseName),
    prisma.course.findUnique({
      where: { name: match.courseName },
      select: { centerLat: true, centerLng: true },
    }),
  ]);
  // Wind at the course center (cached server-side). Null when the
  // course has no coordinates or the weather fetch fails -- the client
  // hides its wind tile in that case.
  const wind =
    course?.centerLat != null && course?.centerLng != null
      ? await getWindForCoord(course.centerLat, course.centerLng).catch(
          () => null,
        )
      : null;

  return NextResponse.json({
    match: {
      id: match.id,
      courseName: match.courseName,
      scheduledAt: match.scheduledAt,
      status: match.status,
      holes: match.holes,
      startingHole: match.startingHole,
      scoringMode: match.scoringMode,
      format: match.format,
      isCreator,
      myMatchPlayerId:
        match.players.find((p) => p.userId === user.id)?.id ?? null,
      pars,
      players: match.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        handicap: p.handicap,
        seat: p.seat,
        team: p.team,
        // Avatar: photo URL when the user uploaded one; otherwise the
        // client renders an initials bubble (the web's generated
        // boring-avatars can't be reproduced natively -- conscious
        // deviation). Seed/variant travel anyway for future use.
        avatarUrl: p.user?.avatarUrl ?? null,
        avatarSeed: p.user?.avatarSeed ?? null,
        avatarVariant: p.user?.avatarVariant ?? null,
        scoresByHole: Object.fromEntries(
          p.scores.map((s) => [s.hole, s.strokes]),
        ),
      })),
    },
    // Keyed by absolute hole number. Polygons are arrays of {lat,lng}.
    holeGeo,
    hazards,
    // { speedMph, fromDeg } | null -- fromDeg is the direction the wind
    // blows FROM, degrees clockwise from north.
    wind: wind ? { speedMph: wind.speedMph, fromDeg: wind.fromDeg } : null,
    // Win probability per matchPlayerId (0..1). The client derives the
    // trend arrow the same way the web does: >=0.4 up, >=0.2 flat,
    // else down.
    odds: { probabilities },
    // [{ kind, leaderboards: [{ key, kind, title, subtitle?, rows:
    //    [{ playerId, player, value, numeric, isLeader }] }] }]
    // Empty array when the match has no side games.
    sideGames,
  });
}
