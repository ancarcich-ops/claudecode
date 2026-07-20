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

// ===== Writes + helpers (shared by web actions + the mobile API) ======

/** Last 10 digits of a phone, so formatting variants match. Null if too
 *  short to be a real number. Used for opt-in phone search + storage. */
export function normalizePhone(raw: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/**
 * Request to follow `targetId`. Auto-accepted when the target allows it;
 * otherwise PENDING. Idempotent (an existing row is left as-is). Returns
 * the resulting state, or "none" for self / missing target / no-op.
 */
export async function requestFollow(
  meId: string,
  targetId: string,
): Promise<FollowState> {
  if (!targetId || targetId === meId) return "none";
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, autoAcceptFollows: true },
  });
  if (!target) return "none";

  const existing = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: meId, followeeId: target.id } },
    select: { status: true },
  });
  if (existing) return existing.status === "ACCEPTED" ? "accepted" : "pending";

  const accepted = target.autoAcceptFollows;
  await prisma.follow.create({
    data: {
      followerId: meId,
      followeeId: target.id,
      status: accepted ? "ACCEPTED" : "PENDING",
      respondedAt: accepted ? new Date() : null,
    },
  });
  return accepted ? "accepted" : "pending";
}

/** Stop following, or cancel a pending request (delete me -> target). */
export async function unfollow(meId: string, targetId: string): Promise<void> {
  if (!targetId) return;
  await prisma.follow.deleteMany({
    where: { followerId: meId, followeeId: targetId },
  });
}

/** Respond to an incoming request: accept it, or decline/remove (delete). */
export async function respondToFollow(
  meId: string,
  followerId: string,
  accept: boolean,
): Promise<void> {
  if (!followerId) return;
  if (accept) {
    await prisma.follow.updateMany({
      where: { followerId, followeeId: meId, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
  } else {
    await prisma.follow.deleteMany({ where: { followerId, followeeId: meId } });
  }
}

/** Toggle auto-accept; enabling also approves anyone currently waiting. */
export async function setAutoAccept(meId: string, on: boolean): Promise<void> {
  await prisma.user.update({
    where: { id: meId },
    data: { autoAcceptFollows: on },
  });
  if (on) {
    await prisma.follow.updateMany({
      where: { followeeId: meId, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
  }
}

// ===== Open people search (shared by web + mobile) ====================

export type UserSearchResult = FollowUser & { followState: FollowState };

/**
 * Open search across all users for the follow flow. Matches username or
 * display name (fuzzy, case-insensitive), plus EXACT email or phone when
 * the query looks like one (never partial -- no enumeration). Never
 * returns email/phone. Excludes the caller; includes the caller's follow
 * state per result. Ranked: exact/prefix username, then name.
 */
export async function searchUsers(
  meId: string,
  qRaw: string,
): Promise<UserSearchResult[]> {
  const q = (qRaw ?? "").trim();
  if (q.length < 1) return [];

  const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q);
  const or: Record<string, unknown>[] = [
    { username: { contains: q, mode: "insensitive" } },
    { displayName: { contains: q, mode: "insensitive" } },
  ];
  if (looksLikeEmail) or.push({ email: q.toLowerCase() });
  const phoneMatch = normalizePhone(q);
  if (phoneMatch) or.push({ phone: phoneMatch });

  const rows = await prisma.user.findMany({
    // `mode: "insensitive"` is Postgres-only; cast through `never` since
    // local types are SQLite-based (prod is Postgres).
    where: { id: { not: meId }, OR: or } as never,
    take: 20,
    select: { ...USER_CARD },
  });

  const follows = rows.length
    ? await prisma.follow.findMany({
        where: { followerId: meId, followeeId: { in: rows.map((r) => r.id) } },
        select: { followeeId: true, status: true },
      })
    : [];
  const stateById = new Map<string, FollowState>();
  for (const f of follows) {
    stateById.set(f.followeeId, f.status === "ACCEPTED" ? "accepted" : "pending");
  }

  const ql = q.toLowerCase();
  return rows
    .map((r) => {
      const un = r.username.toLowerCase();
      const dn = (r.displayName ?? "").toLowerCase();
      let rank = 4;
      if (un === ql) rank = 0;
      else if (un.startsWith(ql)) rank = 1;
      else if (dn.startsWith(ql)) rank = 2;
      else if (dn.split(/\s+/).some((w) => w.startsWith(ql))) rank = 3;
      return { r: r as FollowUser, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.r.username.localeCompare(b.r.username))
    .map(({ r }) => ({ ...r, followState: stateById.get(r.id) ?? ("none" as FollowState) }));
}
