// GET /api/mobile/groups/:id/members
// Auth: Bearer token; caller must be a member of the group.
// :id accepts the group id or slug (same as the web route).
// Returns the full members list the web /groups/[id] page shows -- each
// with the username needed to open their read-only stats profile.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { findGroupByIdOrSlug } from "@/lib/groups";

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

  const rows = await prisma.groupMember.findMany({
    where: { groupId: resolved.id },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      role: true,
      joinedAt: true,
      userId: true,
      user: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          avatarSeed: true,
          avatarVariant: true,
        },
      },
    },
  });

  return NextResponse.json({
    group: { id: resolved.id, name: resolved.name },
    members: rows.map((m) => ({
      userId: m.userId,
      // username powers the tap-through to /users/:username/stats.
      username: m.user?.username ?? null,
      displayName: m.user?.displayName ?? m.user?.username ?? "Member",
      role: m.role, // "owner" | "member"
      joinedAt: m.joinedAt,
      isYou: m.userId === user.id,
      avatarUrl: m.user?.avatarUrl ?? null,
      avatarSeed: m.user?.avatarSeed ?? m.user?.username ?? m.userId,
      avatarVariant: m.user?.avatarVariant ?? null,
    })),
  });
}
