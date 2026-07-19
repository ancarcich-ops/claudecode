// Read helpers for the one-way, approval-gated follow graph. Writes live
// in actions.ts (requestFollow/accept/decline/unfollow). Visibility --
// how an accepted follow surfaces the followee's rounds -- lives in
// groups.ts (visibleMatchWhere / canViewMatch).

import { prisma } from "./db";

export type FollowState = "none" | "pending" | "accepted";

const USER_CARD = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  avatarSeed: true,
  avatarVariant: true,
} as const;

export type FollowUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  avatarVariant: string | null;
};

/** viewer -> target follow state (does the viewer follow the target?). */
export async function outgoingFollowState(
  viewerId: string,
  targetId: string,
): Promise<FollowState> {
  if (viewerId === targetId) return "none";
  const row = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
    select: { status: true },
  });
  if (!row) return "none";
  return row.status === "ACCEPTED" ? "accepted" : "pending";
}

/** Count of incoming follow requests awaiting my approval (for the badge). */
export async function pendingRequestCount(meId: string): Promise<number> {
  return prisma.follow.count({
    where: { followeeId: meId, status: "PENDING" },
  });
}

/** People asking to follow me (I approve or decline). */
export async function listPendingRequests(meId: string) {
  const rows = await prisma.follow.findMany({
    where: { followeeId: meId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, follower: { select: USER_CARD } },
  });
  return rows.map((r) => ({ since: r.createdAt, user: r.follower as FollowUser }));
}

/** People who follow me (accepted). */
export async function listFollowers(meId: string) {
  const rows = await prisma.follow.findMany({
    where: { followeeId: meId, status: "ACCEPTED" },
    orderBy: { respondedAt: "desc" },
    select: { follower: { select: USER_CARD } },
  });
  return rows.map((r) => r.follower as FollowUser);
}

/** People I follow (accepted). */
export async function listFollowing(meId: string) {
  const rows = await prisma.follow.findMany({
    where: { followerId: meId, status: "ACCEPTED" },
    orderBy: { respondedAt: "desc" },
    select: { followee: { select: USER_CARD } },
  });
  return rows.map((r) => r.followee as FollowUser);
}

/** Outgoing requests I've sent that are still pending. */
export async function listOutgoingPending(meId: string) {
  const rows = await prisma.follow.findMany({
    where: { followerId: meId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { followee: { select: USER_CARD } },
  });
  return rows.map((r) => r.followee as FollowUser);
}
