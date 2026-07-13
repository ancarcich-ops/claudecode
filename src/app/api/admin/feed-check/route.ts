// GET /api/admin/feed-check
//
// Diagnoses why a round shows on one surface but not another. For the
// signed-in WEB user, reports: who you are, your group memberships, the
// active-group cookie the web feed is scoped to, and -- for any match
// whose course name matches ?course= (default "Strawberry") -- whether
// it's visible to you and, if not, why. No secrets; auth required.
//
// Usage: sign in on the web, open /api/admin/feed-check (optionally
// ?course=strawberry), and share the JSON.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveGroupId, visibleMatchWhere } from "@/lib/groups";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const courseTerm = (
    new URL(req.url).searchParams.get("course") || "Strawberry"
  ).trim();

  const activeGroupId = getActiveGroupId();
  const myGroups = await prisma.groupMember.findMany({
    where: { userId: user.id },
    select: { group: { select: { id: true, name: true } } },
  });
  const myGroupIds = new Set(myGroups.map((m) => m.group.id));

  // The exact where-clause the web home uses for its feed.
  const where = await visibleMatchWhere(user.id, activeGroupId);
  const visibleCompletedCount = await prisma.match.count({
    where: { ...where, status: "COMPLETED" },
  });

  // Every match matching the course term (regardless of visibility), with
  // a per-match explanation of whether THIS user can see it.
  const candidates = await prisma.match.findMany({
    where: { courseName: { contains: courseTerm } },
    orderBy: { scheduledAt: "desc" },
    take: 10,
    select: {
      id: true,
      courseName: true,
      status: true,
      completedAt: true,
      groupId: true,
      group: { select: { name: true } },
      createdById: true,
      players: {
        select: {
          displayName: true,
          userId: true,
          user: {
            select: { groupMemberships: { select: { groupId: true } } },
          },
        },
      },
    },
  });

  const matches = candidates.map((m) => {
    const isPublic = m.groupId === null;
    const inPostedGroup = m.groupId ? myGroupIds.has(m.groupId) : false;
    const isCreator = m.createdById === user.id;
    const isPlayer = m.players.some((p) => p.userId === user.id);
    // Cross-group: a player who is a member of one of MY groups.
    const crossGroup = m.players.some((p) =>
      (p.user?.groupMemberships ?? []).some((gm) => myGroupIds.has(gm.groupId)),
    );
    const visible = isPublic || inPostedGroup || crossGroup;
    return {
      id: m.id,
      courseName: m.courseName,
      status: m.status,
      completedAt: m.completedAt,
      groupId: m.groupId,
      groupName: m.group?.name ?? null,
      players: m.players.map((p) => ({
        displayName: p.displayName,
        linked: !!p.userId,
      })),
      visibleToMe: visible,
      why: visible
        ? isPublic
          ? "public round"
          : inPostedGroup
            ? "you're in its group"
            : "cross-group (a player shares a group with you)"
        : "NOT visible: it's a private group round and you are neither in its group, a player, nor sharing a group with any player",
      alsoIsCreator: isCreator,
      alsoIsPlayer: isPlayer,
    };
  });

  return NextResponse.json({
    you: { id: user.id, username: user.username, displayName: user.displayName },
    activeGroupCookie: activeGroupId || "(none — all groups)",
    myGroups: myGroups.map((m) => m.group),
    visibleCompletedCount,
    matches,
    hint:
      matches.length === 0
        ? `No match found whose course name contains "${courseTerm}". Try ?course=<part of the course name>.`
        : matches.every((m) => m.visibleToMe)
          ? "The round IS visible to this account. If the web still doesn't show it, it's a caching/refresh issue — reload."
          : "The round is NOT visible to this account. Most likely you're signed in on the web as a different account than the app (this one isn't in the round's group and isn't a player). Sign in on the web as the account that played it.",
  });
}
