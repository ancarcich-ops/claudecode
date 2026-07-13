// GET /api/mobile/stats
// Auth: Bearer token. The caller's full personal-stats payload for the
// iOS Stats tab -- mirrors what the web /stats page computes: the
// Sticks Index hero (index + 30-day delta + sparkline trajectory),
// rounds-over-time series, scoring analysis vs pickable baselines,
// at-a-glance counts, wins by game, course bests, and logged rounds.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { computeUserStats } from "@/lib/userStats";
import { computeIndexTrend } from "@/lib/indexTrend";
import { handicapBreakdown } from "@/lib/handicap";
import {
  BASELINE_HANDICAPS,
  expectedAvgScores,
  expectedDistribution,
} from "@/lib/scoringBaseline";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const stats = await computeUserStats(user.id);
  if (!stats) {
    return NextResponse.json({ error: "No stats" }, { status: 404 });
  }
  const trend = computeIndexTrend(stats.rounds);
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { ghinNumber: true, targetIndex: true },
  });

  // Which logged rounds the caller created -- gates the delete
  // affordance in the iOS logged-rounds list (creator-only, same as
  // the DELETE endpoint's rule). One batch query over the round ids.
  const roundMatchIds = stats.rounds.map((r) => r.matchId);
  const creatorRows = roundMatchIds.length
    ? await prisma.match.findMany({
        where: { id: { in: roundMatchIds } },
        select: { id: true, createdById: true },
      })
    : [];
  const createdByMe = new Map(
    creatorRows.map((m) => [m.id, m.createdById === user.id]),
  );

  return NextResponse.json({
    stats: {
      username: stats.username,
      displayName: stats.displayName,
      // Hero
      index: stats.handicap?.index ?? null,
      indexFromRounds: stats.handicap?.fromRounds ?? 0,
      // Full "how it's calculated" breakdown: per-round differentials,
      // which counted, average, adjust, x0.96. Null until 3+ rounds.
      indexBreakdown: handicapBreakdown(stats.rounds),
      indexDelta30: trend.delta30,
      indexTrajectory: trend.trajectory,
      roundsCompleted: stats.rounds.length,
      ghin: profile?.ghinNumber ?? null,
      // Personal goal index -- "TARGET 9.0 · 2.6 TO GO" in the hero.
      targetIndex: profile?.targetIndex ?? null,
      avg18Gross: stats.avg18Gross,
      bestRound: stats.bestRound,
      // Rounds-over-time chart + logged rounds list (same source).
      // createdByMe gates the delete affordance per round.
      rounds: stats.rounds.map((r) => ({
        ...r,
        createdByMe: createdByMe.get(r.matchId) ?? false,
      })),
      // Scoring analysis
      par3: stats.par3,
      par4: stats.par4,
      par5: stats.par5,
      distribution: stats.distribution,
      // At a glance (win rate = mainWins / matchesPlayed, like the web)
      matchesPlayed: stats.matchesPlayed,
      totalWins: stats.totalWins,
      mainWins: stats.mainWins,
      currentMainStreak: stats.currentMainStreak,
      bestMainStreak: stats.bestMainStreak,
      // Wins by game
      winsByGame: {
        main: stats.mainWins,
        stableford: stats.stablefordWins,
        skins: stats.skinsWins,
        nassau: stats.nassauWins,
        bbb: stats.bbbWins,
        snake: stats.snakeWins,
        wolf: stats.wolfWins,
      },
      courseRecords: stats.courseRecords,
    },
    // Baseline comparison sets for the scoring-analysis picker --
    // one entry per selectable handicap, same math as the web.
    baselines: BASELINE_HANDICAPS.map((hcp) => ({
      hcp,
      avgScores: expectedAvgScores(hcp),
      distribution: expectedDistribution(hcp),
    })),
  });
}
