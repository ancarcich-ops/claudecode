// GET /api/mobile/users/:username/stats
// Auth: Bearer token (any signed-in user). Another member's READ-ONLY
// stats -- the mobile equivalent of the web /u/[username] profile. Same
// payload shape as GET /stats so the app can reuse its stats models, but
// forced read-only: every round's createdByMe is false (no delete
// affordance) and the private goal fields (ghin, targetIndex) are hidden.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { outgoingFollowState } from "@/lib/follows";
import { computeUserStats } from "@/lib/userStats";
import { computeIndexTrend } from "@/lib/indexTrend";
import { handicapBreakdown } from "@/lib/handicap";
import {
  BASELINE_HANDICAPS,
  expectedAvgScores,
  expectedDistribution,
} from "@/lib/scoringBaseline";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { username: string } },
) {
  const viewer = await getUserFromBearer(req);
  if (!viewer) return unauthorized();

  const needle = decodeURIComponent(params.username || "").trim().toLowerCase();
  if (!needle) {
    return NextResponse.json({ error: "Username required." }, { status: 400 });
  }

  // Match by username first, then display name (case-insensitive JS
  // compare -- usernames are stored lowercased, display names as-typed).
  let target = await prisma.user.findUnique({ where: { username: needle } });
  if (!target) {
    const candidates = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true },
      take: 1000,
    });
    const hit = candidates.find(
      (u) =>
        u.username.toLowerCase() === needle ||
        (u.displayName ?? "").toLowerCase() === needle,
    );
    if (hit) target = await prisma.user.findUnique({ where: { id: hit.id } });
  }
  if (!target) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const stats = await computeUserStats(target.id);
  if (!stats) {
    return NextResponse.json({ error: "No stats" }, { status: 404 });
  }
  const trend = computeIndexTrend(stats.rounds);
  // Viewer -> target follow state, so the native profile can render the
  // Follow / Requested / Following button. targetUserId is the id the
  // app posts to /api/mobile/follows for follow actions.
  const followState = await outgoingFollowState(viewer.id, target.id);

  return NextResponse.json({
    // isSelf lets the app send the viewer to their own editable Stats tab
    // instead of a read-only profile if they tap themselves.
    isSelf: target.id === viewer.id,
    targetUserId: target.id,
    followState,
    stats: {
      username: stats.username,
      displayName: stats.displayName,
      index: stats.handicap?.index ?? null,
      indexFromRounds: stats.handicap?.fromRounds ?? 0,
      indexBreakdown: handicapBreakdown(stats.rounds),
      indexDelta30: trend.delta30,
      indexTrajectory: trend.trajectory,
      roundsCompleted: stats.rounds.length,
      // Private to the owner -- never expose another member's GHIN/target.
      ghin: null,
      targetIndex: null,
      avg18Gross: stats.avg18Gross,
      bestRound: stats.bestRound,
      // Read-only: no round is deletable from a profile view.
      rounds: stats.rounds.map((r) => ({ ...r, createdByMe: false })),
      par3: stats.par3,
      par4: stats.par4,
      par5: stats.par5,
      distribution: stats.distribution,
      matchesPlayed: stats.matchesPlayed,
      totalWins: stats.totalWins,
      mainWins: stats.mainWins,
      currentMainStreak: stats.currentMainStreak,
      bestMainStreak: stats.bestMainStreak,
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
    baselines: BASELINE_HANDICAPS.map((hcp) => ({
      hcp,
      avgScores: expectedAvgScores(hcp),
      distribution: expectedDistribution(hcp),
    })),
  });
}
