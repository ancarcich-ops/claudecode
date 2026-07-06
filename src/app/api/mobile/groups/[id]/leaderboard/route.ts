// GET /api/mobile/groups/:id/leaderboard
// Auth: Bearer token; caller must be a member of the group.
// :id accepts the group id or slug (same as the web route).
// Returns the exact GroupLeaderboard the web page renders: per-member
// win counts by game type (rows), which game types have appeared
// (has* flags -- hide columns that are all-zero), plus the extras
// (course records, champions, streaks, head-to-head).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { findGroupByIdOrSlug } from "@/lib/groups";
import { computeGroupLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const resolved = await findGroupByIdOrSlug(params.id);
  if (!resolved) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: resolved.id, userId: user.id } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not your group" }, { status: 403 });
  }

  const leaderboard = await computeGroupLeaderboard(resolved.id);
  return NextResponse.json({ leaderboard });
}
