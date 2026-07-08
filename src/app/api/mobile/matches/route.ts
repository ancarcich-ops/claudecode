// GET /api/mobile/matches
// Auth: Bearer token.
// Returns the caller's matches (creator or seated), most recent first.
// Carries enough per-match data for the home feed's match cards: pars
// + every player's scores (the colored hole dot-row, momentum, and
// standings context are all client-derivable from those), plus avatar
// fields and completedAt.
// 200: { matches: [{ id, courseName, scheduledAt, completedAt, status,
//        holes, startingHole, scoringMode, format, pars,
//        myMatchPlayerId, players: [{ id, userId, displayName, seat,
//        handicap, avatarUrl, avatarSeed, avatarVariant,
//        scoresByHole }] }] }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { computeOdds, parseParData, type ScoringMode } from "@/lib/odds";
import { defaultPars } from "@/lib/odds";
import { COURSE_PRESETS } from "@/lib/courses";
import { isSideGameKind } from "@/lib/sideGames";
import { getCourseTeeSet } from "@/lib/courseTees";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { createdById: user.id },
        { players: { some: { userId: user.id } } },
      ],
    },
    orderBy: { scheduledAt: "desc" },
    take: 50,
    select: {
      id: true,
      courseName: true,
      scheduledAt: true,
      completedAt: true,
      status: true,
      holes: true,
      startingHole: true,
      scoringMode: true,
      format: true,
      groupId: true,
      parData: true,
      players: {
        orderBy: { seat: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          seat: true,
          handicap: true,
          _count: { select: { wagers: true } },
          scores: { select: { hole: true, strokes: true } },
          user: {
            select: {
              avatarUrl: true,
              avatarSeed: true,
              avatarVariant: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    matches: matches.map((m) => {
      const pars = parseParData(m.parData, m.holes);
      // Win probability per matchPlayerId -- same engine as the web
      // home feed's cards. Scramble matches price teams, which needs
      // side-game config this endpoint doesn't load; they get {} and
      // the client hides the Win column (like solo matches).
      let probabilities: Record<string, number> = {};
      if (m.format !== "SCRAMBLE" && m.players.length > 1) {
        try {
          const scoringMode: ScoringMode =
            m.scoringMode === "GROSS"
              ? "GROSS"
              : m.scoringMode === "CUSTOM"
                ? "CUSTOM"
                : "NET";
          const odds = computeOdds({
            status: m.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
            holes: m.holes,
            startingHole: m.startingHole ?? 1,
            pars,
            scoringMode,
            players: m.players.map((p) => ({
              id: p.id,
              handicap: p.handicap,
              wagerCount: p._count.wagers,
              scoresByHole: Object.fromEntries(
                p.scores.map((s) => [s.hole, s.strokes]),
              ),
            })),
          });
          probabilities = Object.fromEntries(
            m.players.map((p) => [p.id, odds.probabilities[p.id] ?? 0]),
          );
        } catch {
          // Odds are decoration on a list card -- never fail the feed.
        }
      }
      return {
      id: m.id,
      courseName: m.courseName,
      scheduledAt: m.scheduledAt,
      completedAt: m.completedAt,
      status: m.status,
      holes: m.holes,
      startingHole: m.startingHole,
      scoringMode: m.scoringMode,
      format: m.format,
      groupId: m.groupId,
      pars,
      probabilities,
      myMatchPlayerId:
        m.players.find((p) => p.userId === user.id)?.id ?? null,
      players: m.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        seat: p.seat,
        handicap: p.handicap,
        avatarUrl: p.user?.avatarUrl ?? null,
        avatarSeed: p.user?.avatarSeed ?? null,
        avatarVariant: p.user?.avatarVariant ?? null,
        scoresByHole: Object.fromEntries(
          p.scores.map((s) => [s.hole, s.strokes]),
        ),
      })),
      };
    }),
  });
}

// POST /api/mobile/matches -- start a round from the iOS app.
// Body: {
//   "courseName": "...",              // must match the course catalog
//   "scheduledAt": "ISO"?,            // default: now
//   "holes": 9 | 18,                  // default 18
//   "startingHole": 1 | 10,           // 10 only valid for 9-hole rounds
//   "scoringMode": "NET"|"GROSS"|"CUSTOM",   // default NET
//   "players": [{ "displayName", "handicap", "userId"? }],  // >= 1
//   "sideGames": ["SKINS", ...]?,     // recognized kinds; NASSAU needs 18
//   "groupId": "..."?                 // must be a group the caller is in
// }
// INDIVIDUAL format only (scramble/tournament rounds stay on the web).
// Mirrors the web createMatchAction's validations; pars resolve
// server-side: catalog preset -> course master pars -> default layout.
// 200: { "match": { "id" } }   400/403: { "error": "..." }
export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: {
    courseName?: unknown;
    scheduledAt?: unknown;
    holes?: unknown;
    startingHole?: unknown;
    scoringMode?: unknown;
    players?: unknown;
    sideGames?: unknown;
    groupId?: unknown;
  };
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
      {
        error:
          "Course not in catalog. Pick from the list, or reach out to support to add it.",
      },
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
    : new Date();
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
      // Tee the player played, for the WHS rating snapshot. Optional --
      // when absent the course default tee is used.
      teeName: String((p as { teeName?: unknown })?.teeName ?? "").trim() || null,
      teeGender:
        String((p as { teeGender?: unknown })?.teeGender ?? "").trim() || null,
    }))
    .filter((p) => p.displayName.length > 0);
  if (drafts.length < 1) {
    return NextResponse.json(
      { error: "Need at least one player" },
      { status: 400 },
    );
  }
  if (drafts.length > 8) {
    return NextResponse.json({ error: "Too many players" }, { status: 400 });
  }
  if (drafts.some((p) => Number.isNaN(p.handicap))) {
    return NextResponse.json(
      { error: "Handicaps must be numbers" },
      { status: 400 },
    );
  }
  // Each linked Sticks account can only fill one seat.
  const linkedSet = new Set<string>();
  for (const d of drafts) {
    if (!d.explicitUserId) continue;
    if (linkedSet.has(d.explicitUserId)) {
      return NextResponse.json(
        {
          error:
            "Same player is in this round twice. Each linked account can only fill one slot.",
        },
        { status: 400 },
      );
    }
    linkedSet.add(d.explicitUserId);
  }

  // Side games: recognized kinds only; Nassau needs 18 holes.
  const sideGameKinds = Array.from(
    new Set(
      (Array.isArray(body.sideGames) ? body.sideGames : [])
        .map((k) => String(k))
        .filter(isSideGameKind)
        .filter((k) => !(k === "NASSAU" && holes !== 18)),
    ),
  );

  // Group scoping: must be a group the caller belongs to, else 403 --
  // the app offers only the caller's own groups, so a mismatch is a
  // real error, not something to silently drop.
  let groupId: string | null = null;
  const groupIdRaw = String(body.groupId ?? "").trim();
  if (groupIdRaw) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: groupIdRaw, userId: user.id } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not your group" }, { status: 403 });
    }
    groupId = groupIdRaw;
  }

  // Pars: catalog preset -> course master pars -> default layout.
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

  // Resolve linked accounts: explicit userId first, then the web's
  // username == displayName fallback for hand-typed names.
  const explicitIds = drafts
    .map((d) => d.explicitUserId)
    .filter((v): v is string => !!v);
  const lookup = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: explicitIds } },
        {
          username: {
            in: drafts.map((d) => d.displayName.toLowerCase()),
          },
        },
      ],
    },
    select: { id: true, username: true },
  });
  const userById = new Map(lookup.map((u) => [u.id, u]));
  const userByName = new Map(lookup.map((u) => [u.username.toLowerCase(), u]));

  // Snapshot each player's tee rating/slope from the course's tee set
  // once (fetched a single time, resolved per player in-memory) so the
  // round's handicap differential is fixed to the tee actually played.
  const teeSet = await getCourseTeeSet(preset.name);
  const snapshotFor = (teeName: string | null, gender: string | null) => {
    if (teeSet.tees.length === 0) return null;
    const wanted = (teeName ?? teeSet.defaultTeeName ?? "").toLowerCase();
    const g = gender === "W" ? "W" : gender === "M" ? "M" : null;
    const tee =
      (g &&
        teeSet.tees.find(
          (t) => t.name.toLowerCase() === wanted && t.gender === g,
        )) ||
      teeSet.tees.find(
        (t) => t.name.toLowerCase() === wanted && t.gender === "M",
      ) ||
      teeSet.tees.find((t) => t.name.toLowerCase() === wanted) ||
      teeSet.tees.find((t) => t.name === teeSet.defaultTeeName) ||
      teeSet.tees[0];
    return tee
      ? { teeName: tee.name, courseRating: tee.rating, slope: tee.slope }
      : null;
  };

  const match = await prisma.match.create({
    data: {
      courseName: preset.name,
      scheduledAt,
      holes,
      startingHole,
      parData: JSON.stringify(pars),
      scoringMode,
      format: "INDIVIDUAL",
      createdById: user.id,
      groupId,
      players: {
        create: drafts.map((p, i) => {
          const explicit = p.explicitUserId
            ? userById.get(p.explicitUserId)
            : undefined;
          const byName = userByName.get(p.displayName.toLowerCase());
          const linked = explicit ?? byName;
          const tee = snapshotFor(p.teeName, p.teeGender);
          return {
            displayName: p.displayName,
            handicap: p.handicap,
            seat: i,
            userId: linked?.id,
            team: null,
            teeName: tee?.teeName ?? null,
            courseRating: tee?.courseRating ?? null,
            slope: tee?.slope ?? null,
          };
        }),
      },
      sideGames: { create: sideGameKinds.map((kind) => ({ kind })) },
    },
    select: { id: true },
  });

  return NextResponse.json({ match: { id: match.id } });
}
