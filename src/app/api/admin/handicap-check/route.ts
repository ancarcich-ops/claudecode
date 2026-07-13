// GET /api/admin/handicap-check?user=<username>
//
// Shows the full handicap-index math for a player: every round in the
// scoring record (last 20), each round's differential and how it was
// derived (WHS rating/slope vs the score-only fallback), which rounds
// counted as the "best N", the average, the adjustment, the 0.96 factor,
// and the resulting index. Defaults to the signed-in user. Auth required.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeUserStats } from "@/lib/userStats";
import { handicapBreakdown } from "@/lib/handicap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const raw = (new URL(req.url).searchParams.get("user") || "").trim();
  const needle = raw.toLowerCase();

  // Match by username OR display name, case-insensitively. Usernames are
  // stored lowercased; display names are as-typed ("BigPeas"), so compare
  // in JS to avoid the Postgres-only `mode: "insensitive"`.
  let target = raw ? null : viewer;
  if (raw) {
    target = await prisma.user.findUnique({ where: { username: needle } });
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
  }
  if (!target) {
    return NextResponse.json(
      {
        error: `No player matches "${raw}" by username or display name.`,
        hint: "Try their exact @username, or their display name as it appears in the app.",
      },
      { status: 404 },
    );
  }

  const stats = await computeUserStats(target.id);
  if (!stats) {
    return NextResponse.json({
      player: { username: target.username, displayName: target.displayName },
      index: null,
      note: "No played rounds yet.",
    });
  }

  const breakdown = handicapBreakdown(stats.rounds);
  if (!breakdown) {
    return NextResponse.json({
      player: { username: target.username, displayName: target.displayName },
      index: null,
      totalRounds: stats.rounds.length,
      note: "Not enough rounds yet — WHS needs at least 3.",
    });
  }

  return NextResponse.json({
    player: { username: target.username, displayName: target.displayName },
    index: breakdown.index,
    formula:
      "index = round( (average of best-N differentials − adjust) × 0.96, 1 )",
    bestN: breakdown.usedCount,
    adjust: breakdown.adjust,
    averageOfBestN: breakdown.average,
    factor: breakdown.factor,
    fromRounds: breakdown.fromRounds,
    totalRounds: breakdown.totalRounds,
    // Chronological; `used: true` marks the differentials that counted.
    rounds: breakdown.perRound.map((r) => ({
      course: r.courseName,
      holes: r.holesPlayed,
      gross: r.gross,
      vsPar: r.vsPar,
      rating: r.rating,
      slope: r.slope,
      differential: r.differential,
      method: r.method, // "WHS" (rating/slope) or "score-only" (fallback)
      counted: r.used,
    })),
  });
}
