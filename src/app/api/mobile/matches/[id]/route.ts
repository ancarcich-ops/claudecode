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
import { COURSE_PRESETS } from "@/lib/courses";
import { defaultPars } from "@/lib/odds";
import { isSideGameKind } from "@/lib/sideGames";
import { getCourseTeeSet } from "@/lib/courseTees";

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

// DELETE /api/mobile/matches/:id -- remove a logged round entirely.
// Creator only (same rule as the web's delete): seated players who
// didn't create the match can't delete it. Cascades take the players,
// scores, side games, and shares with it.
// 200: { "ok": true }
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { id: true, createdById: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the round's creator can delete it." },
      { status: 403 },
    );
  }
  await prisma.match.delete({ where: { id: match.id } });
  return NextResponse.json({ ok: true });
}

// PATCH /api/mobile/matches/:id -- edit a round's details before it
// starts. Creator only, and ONLY while status is UPCOMING with no
// scores logged (matches the web editMatchAction: once play begins the
// round can't be edited, only deleted). INDIVIDUAL format only.
// Body: same shape as POST /matches (courseName, scheduledAt?, holes,
// startingHole, scoringMode, players[{displayName,handicap,userId?,
// teeName?,teeGender?}], sideGames[]). Players are reconciled by seat
// so ids are preserved where possible.
// 200: { "match": { "id" } }   400/403 { "error": "..." }
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const existing = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      players: { orderBy: { seat: "asc" }, include: { scores: true } },
      sideGames: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (existing.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the round's creator can edit it." },
      { status: 403 },
    );
  }
  if (existing.status !== "UPCOMING") {
    return NextResponse.json(
      { error: "Only rounds that haven't started can be edited." },
      { status: 400 },
    );
  }
  if (existing.players.some((p) => p.scores.length > 0)) {
    return NextResponse.json(
      { error: "Scores are logged -- this round can no longer be edited." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const courseName = String(body.courseName ?? "").trim();
  const preset = COURSE_PRESETS.find(
    (p) => p.name.toLowerCase() === courseName.toLowerCase(),
  );
  if (!preset) {
    return NextResponse.json(
      { error: "Course not in catalog. Pick from the list." },
      { status: 400 },
    );
  }

  const holes: 9 | 18 = Number(body.holes) === 9 ? 9 : 18;
  const startingHole =
    holes === 9 && Number(body.startingHole) === 10 ? 10 : 1;
  const scoringModeRaw = String(body.scoringMode ?? "NET");
  const scoringMode: "NET" | "GROSS" | "CUSTOM" =
    scoringModeRaw === "GROSS" || scoringModeRaw === "CUSTOM"
      ? scoringModeRaw
      : "NET";
  const scheduledAt = body.scheduledAt
    ? new Date(String(body.scheduledAt))
    : existing.scheduledAt;
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Bad tee time" }, { status: 400 });
  }

  const playersRaw = Array.isArray(body.players) ? body.players : [];
  const drafts = playersRaw
    .map((p) => ({
      displayName: String((p as { displayName?: unknown })?.displayName ?? "")
        .trim()
        .slice(0, 40),
      handicap: Number((p as { handicap?: unknown })?.handicap ?? NaN),
      explicitUserId:
        String((p as { userId?: unknown })?.userId ?? "").trim() || null,
      teeName: String((p as { teeName?: unknown })?.teeName ?? "").trim() || null,
      teeGender:
        String((p as { teeGender?: unknown })?.teeGender ?? "").trim() || null,
    }))
    .filter((p) => p.displayName.length > 0);
  if (drafts.length < 1) {
    return NextResponse.json({ error: "Need at least one player" }, { status: 400 });
  }
  if (drafts.length > 8) {
    return NextResponse.json({ error: "Too many players" }, { status: 400 });
  }
  if (drafts.some((p) => Number.isNaN(p.handicap))) {
    return NextResponse.json({ error: "Handicaps must be numbers" }, { status: 400 });
  }
  const linkedSet = new Set<string>();
  for (const d of drafts) {
    if (!d.explicitUserId) continue;
    if (linkedSet.has(d.explicitUserId)) {
      return NextResponse.json(
        { error: "Same player is in this round twice." },
        { status: 400 },
      );
    }
    linkedSet.add(d.explicitUserId);
  }

  const sideGameKinds = Array.from(
    new Set(
      (Array.isArray(body.sideGames) ? body.sideGames : [])
        .map((k) => String(k))
        .filter(isSideGameKind)
        .filter((k) => !(k === "NASSAU" && holes !== 18)),
    ),
  );

  // Pars: preset -> course master -> default.
  let pars: number[] | null =
    preset.holes === holes && Array.isArray(preset.pars)
      ? preset.pars.slice(0, holes)
      : null;
  if (pars && pars.length !== holes) pars = null;
  if (!pars) {
    const master = await prisma.course.findUnique({
      where: { name: preset.name },
      select: { parData: true },
    });
    if (master?.parData) {
      try {
        const parsed = JSON.parse(master.parData);
        if (
          Array.isArray(parsed) &&
          parsed.length === holes &&
          parsed.every((v) => Number.isFinite(v) && v >= 3 && v <= 6)
        ) {
          pars = parsed.map((v) => Math.round(v));
        }
      } catch {}
    }
  }
  if (!pars) pars = defaultPars(holes);

  // Linked-account resolution (same as create).
  const explicitIds = drafts
    .map((d) => d.explicitUserId)
    .filter((v): v is string => !!v);
  const lookup = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: explicitIds } },
        { username: { in: drafts.map((d) => d.displayName.toLowerCase()) } },
      ],
    },
    select: { id: true, username: true },
  });
  const userById = new Map(lookup.map((u) => [u.id, u]));
  const userByName = new Map(lookup.map((u) => [u.username.toLowerCase(), u]));

  // Tee snapshot per player from the course tee set (fetched once).
  const teeSet = await getCourseTeeSet(preset.name);
  const snapshotFor = (teeName: string | null, gender: string | null) => {
    if (teeSet.tees.length === 0) return null;
    const wanted = (teeName ?? teeSet.defaultTeeName ?? "").toLowerCase();
    const g = gender === "W" ? "W" : gender === "M" ? "M" : null;
    const tee =
      (g && teeSet.tees.find((t) => t.name.toLowerCase() === wanted && t.gender === g)) ||
      teeSet.tees.find((t) => t.name.toLowerCase() === wanted && t.gender === "M") ||
      teeSet.tees.find((t) => t.name.toLowerCase() === wanted) ||
      teeSet.tees.find((t) => t.name === teeSet.defaultTeeName) ||
      teeSet.tees[0];
    return tee ? { teeName: tee.name, courseRating: tee.rating, slope: tee.slope } : null;
  };

  // Update the match's own fields.
  await prisma.match.update({
    where: { id: existing.id },
    data: {
      courseName: preset.name,
      scheduledAt,
      holes,
      startingHole,
      parData: JSON.stringify(pars),
      scoringMode,
    },
  });

  // Reconcile players by seat: update surviving seats in place (id
  // preserved), create new seats, delete trailing removed seats.
  const bySeat = new Map(existing.players.map((p) => [p.seat, p]));
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const explicit = d.explicitUserId ? userById.get(d.explicitUserId) : undefined;
    const byName = userByName.get(d.displayName.toLowerCase());
    const linked = explicit ?? byName;
    const tee = snapshotFor(d.teeName, d.teeGender);
    const data = {
      displayName: d.displayName,
      handicap: d.handicap,
      userId: linked?.id ?? null,
      team: null,
      teeName: tee?.teeName ?? null,
      courseRating: tee?.courseRating ?? null,
      slope: tee?.slope ?? null,
    };
    const seatMatch = bySeat.get(i);
    if (seatMatch) {
      await prisma.matchPlayer.update({ where: { id: seatMatch.id }, data });
    } else {
      await prisma.matchPlayer.create({ data: { ...data, matchId: existing.id, seat: i } });
    }
  }
  for (const p of existing.players) {
    if (p.seat >= drafts.length) {
      await prisma.matchPlayer.delete({ where: { id: p.id } });
    }
  }

  // Reconcile side games.
  for (const sg of existing.sideGames) {
    if (!sideGameKinds.includes(sg.kind as never)) {
      await prisma.sideGame.delete({ where: { id: sg.id } });
    }
  }
  for (const kind of sideGameKinds) {
    await prisma.sideGame.upsert({
      where: { matchId_kind: { matchId: existing.id, kind } },
      update: {},
      create: { matchId: existing.id, kind },
    });
  }

  return NextResponse.json({ match: { id: existing.id } });
}
