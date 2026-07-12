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
import { visibleMatchWhere, type GroupFilter } from "@/lib/groups";
import { buildMatchTickerItems } from "@/lib/matchTicker";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  // Group scoping identical to the web home feed (visibleMatchWhere):
  //   ?group absent | "all" | ""  -> public + your groups + any round
  //                                   involving a member of one of your groups
  //   ?group=public               -> only ungrouped ("public") rounds
  //   ?group=<groupId>            -> rounds posted to that group OR involving
  //                                   any of its members (cross-group visibility)
  // This is what makes a group's feed show every round a member played, not
  // just rounds explicitly posted to the group.
  const groupParam = new URL(req.url).searchParams.get("group");
  const filter: GroupFilter =
    !groupParam || groupParam === "all" ? "" : groupParam;
  const where = await visibleMatchWhere(user.id, filter);

  const matches = await prisma.match.findMany({
    where,
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

      // Scrolling header ticker items for LIVE/UPCOMING cards (the
      // native marquee renders these verbatim).
      const scoringModeForTicker: ScoringMode =
        m.scoringMode === "GROSS"
          ? "GROSS"
          : m.scoringMode === "CUSTOM"
            ? "CUSTOM"
            : "NET";
      const tickerItems = buildMatchTickerItems({
        players: m.players.map((p) => ({
          name: p.displayName,
          winProbability: probabilities[p.id] ?? 0,
          handicap: p.handicap,
          scoresByHole: Object.fromEntries(
            p.scores.map((s) => [s.hole, s.strokes]),
          ),
        })),
        status: m.status as "UPCOMING" | "IN_PROGRESS" | "COMPLETED",
        holes: m.holes,
        startingHole: m.startingHole ?? 1,
        pars,
        scoringMode: scoringModeForTicker,
        totalWagers: m.players.reduce((sum, p) => sum + p._count.wagers, 0),
      });

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
      // Scrolling ticker strings; render only on LIVE/UPCOMING cards.
      tickerItems,
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
//   "format": "INDIVIDUAL"|"SCRAMBLE"|"BOTH", // default INDIVIDUAL
//   "players": [{ "displayName", "handicap", "userId"?, "team"? }], // >=1
//                                     // team 0|1 required for SCRAMBLE/BOTH
//   "sideGames": ["SKINS", ...]?,     // recognized kinds; NASSAU needs 18
//   "groupId": "..."?                 // must be a group the caller is in
// }
// SCRAMBLE = one ball per team; BOTH = individual play + a team-vs-team
// match (default Best Ball). Advanced scramble-handicap / team-rule
// tuning stays on the web.
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
    format?: unknown;
    players?: unknown;
    sideGames?: unknown;
    groupId?: unknown;
    tournamentId?: unknown;
    roundNumber?: unknown;
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
  // Game type / format. Mirrors the web: "SCRAMBLE" = one ball per team
  // (format stored as SCRAMBLE, team on each player). "BOTH" = everyone
  // plays their own ball AND a team-vs-team match runs on top -- stored
  // as INDIVIDUAL format + a TEAM_VS_TEAM side game whose config holds
  // the teams. "INDIVIDUAL" = all-vs-all.
  const formatRaw = String(body.format ?? "INDIVIDUAL").toUpperCase();
  const uiFormat: "INDIVIDUAL" | "SCRAMBLE" | "BOTH" =
    formatRaw === "SCRAMBLE"
      ? "SCRAMBLE"
      : formatRaw === "BOTH"
        ? "BOTH"
        : "INDIVIDUAL";
  const dbFormat: "INDIVIDUAL" | "SCRAMBLE" =
    uiFormat === "SCRAMBLE" ? "SCRAMBLE" : "INDIVIDUAL";
  const usesTeams = uiFormat === "SCRAMBLE" || uiFormat === "BOTH";
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
      // 0 = Team A, 1 = Team B. Only honored when the format uses teams.
      team: (Number((p as { team?: unknown })?.team) === 1 ? 1 : 0) as 0 | 1,
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
  // Team formats need both sides populated, or the odds engine and team
  // scoring break (one team with no players).
  if (usesTeams) {
    if (drafts.length < 2) {
      return NextResponse.json(
        { error: "Team formats need at least 2 players" },
        { status: 400 },
      );
    }
    const teamA = drafts.filter((d) => d.team === 0).length;
    const teamB = drafts.filter((d) => d.team === 1).length;
    if (teamA === 0 || teamB === 0) {
      return NextResponse.json(
        { error: "Each team needs at least one player" },
        { status: 400 },
      );
    }
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
        .filter((k) => !(k === "NASSAU" && holes !== 18))
        // TEAM_VS_TEAM is driven by the "Both" format below, not picked
        // as a manual side game.
        .filter((k) => k !== "TEAM_VS_TEAM"),
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

  // Tournament binding: when tournamentId is given, this match becomes
  // round N of that tournament (roundNumber auto-increments unless
  // supplied). Mirrors the web createMatchAction: public tournaments
  // anyone can add rounds to; group-scoped ones require membership.
  let tournamentId: string | null = null;
  let roundNumber: number | null = null;
  const tournamentIdRaw = String(body.tournamentId ?? "").trim();
  if (tournamentIdRaw) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentIdRaw },
      select: {
        id: true,
        groupId: true,
        status: true,
        matches: { select: { roundNumber: true } },
      },
    });
    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found." },
        { status: 400 },
      );
    }
    let allowed = !tournament.groupId;
    if (!allowed && tournament.groupId) {
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: tournament.groupId, userId: user.id },
        },
        select: { id: true },
      });
      allowed = !!membership;
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "You can't add rounds to this tournament." },
        { status: 403 },
      );
    }
    tournamentId = tournament.id;
    const suppliedRound = Number(body.roundNumber);
    roundNumber =
      Number.isFinite(suppliedRound) && suppliedRound > 0
        ? Math.floor(suppliedRound)
        : tournament.matches.reduce((m, r) => Math.max(m, r.roundNumber ?? 0), 0) +
          1;
    // First round landing flips the tournament to IN_PROGRESS.
    if (tournament.status === "UPCOMING") {
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: "IN_PROGRESS" },
      });
    }
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
      tournamentId,
      roundNumber,
      format: dbFormat,
      scrambleConfig:
        dbFormat === "SCRAMBLE"
          ? JSON.stringify({ handicapMode: "GROSS" })
          : null,
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
            // Team lives on the player only for SCRAMBLE (one ball per
            // team). For "Both" the teams live in the TEAM_VS_TEAM config.
            team: dbFormat === "SCRAMBLE" ? p.team : null,
            teeName: tee?.teeName ?? null,
            courseRating: tee?.courseRating ?? null,
            slope: tee?.slope ?? null,
          };
        }),
      },
      sideGames: { create: sideGameKinds.map((kind) => ({ kind })) },
    },
    select: { id: true, players: { select: { id: true, seat: true } } },
  });

  // "Both" = individual play + a team-vs-team match. Now that the players
  // exist we can build the TEAM_VS_TEAM config from their real ids and
  // seed a default Best Ball rule (finer rule/stake tuning stays on web).
  if (uiFormat === "BOTH") {
    const idBySeat = new Map(match.players.map((p) => [p.seat, p.id]));
    const teams: { 0: string[]; 1: string[] } = { 0: [], 1: [] };
    drafts.forEach((d, i) => {
      const pid = idBySeat.get(i);
      if (pid) teams[d.team].push(pid);
    });
    await prisma.sideGame.create({
      data: {
        matchId: match.id,
        kind: "TEAM_VS_TEAM",
        config: JSON.stringify({ teams, rules: [{ rule: "BEST_BALL" }] }),
      },
    });
  }

  return NextResponse.json({ match: { id: match.id } });
}
