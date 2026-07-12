// GET /api/mobile/tournaments/:id -- tournament detail: meta, the child
// rounds, the cumulative leaderboard, and win odds. Caller must be the
// creator or on the roster. Reuses the same rollup math the web pages do.

import { NextResponse } from "next/server";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import {
  getTournamentById,
  computeTournamentLeaderboard,
} from "@/lib/tournaments";
import { computeTournamentWinOdds } from "@/lib/tournamentOdds";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const t = await getTournamentById(params.id);
  if (!t) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  const isCreator = t.createdById === user.id;
  const onRoster = t.roster.some((r) => r.userId === user.id);
  if (!isCreator && !onRoster) {
    return NextResponse.json({ error: "Not your tournament" }, { status: 403 });
  }

  const [leaderboard, odds] = await Promise.all([
    computeTournamentLeaderboard(params.id),
    computeTournamentWinOdds(params.id),
  ]);

  return NextResponse.json({
    tournament: {
      id: t.id,
      name: t.name,
      status: t.status,
      scoringMode: t.scoringMode,
      roundsPlanned: t.roundsPlanned,
      scheduledStartAt: t.scheduledStartAt,
      notes: t.notes,
      inviteCode: t.inviteCode,
      isCreator,
      createdBy: {
        username: t.createdBy.username,
        displayName: t.createdBy.displayName ?? t.createdBy.username,
      },
      group: t.group
        ? { id: t.group.id, name: t.group.name, slug: t.group.slug }
        : null,
    },
    // Ordered by round number; each is a normal Match the app can open.
    rounds: t.matches.map((m) => ({
      id: m.id,
      roundNumber: m.roundNumber,
      courseName: m.courseName,
      status: m.status,
      scheduledAt: m.scheduledAt,
      completedAt: m.completedAt,
      players: m.players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        userId: p.userId,
      })),
    })),
    roster: t.roster.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      userId: r.userId,
      handicapAtStart: r.handicapAtStart,
    })),
    // LeaderboardRow[]: { rank, playerId, displayName, latestHandicap,
    //   roundScores: (number|null)[], total, playedRounds }
    leaderboard,
    // TournamentOddsRow[]: { rank, displayName, latestHandicap,
    //   roundScores, scoreSoFar, playedRounds, roundsPlanned,
    //   projectedTotal, winProbability }
    odds,
  });
}
