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
