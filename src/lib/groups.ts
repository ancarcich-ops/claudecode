import { cookies } from "next/headers";
import { prisma } from "./db";

const GROUP_COOKIE = "fm_group";

// Empty string = "All my groups + public" (default).
// "public"     = "Public matches only" (matches with no groupId).
// <groupId>    = "Only this group's matches".
export type GroupFilter = "" | "public" | string;

export function getActiveGroupId(): GroupFilter {
  return cookies().get(GROUP_COOKIE)?.value ?? "";
}

export function setActiveGroupCookie(value: GroupFilter) {
  if (!value) {
    cookies().delete(GROUP_COOKIE);
    return;
  }
  cookies().set(GROUP_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function listUserGroups(userId: string) {
  try {
    return await prisma.group.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { members: true, matches: true } } },
    });
  } catch {
    // If the Group table isn't there yet (mid-deploy or unmigrated DB),
    // degrade gracefully rather than 500ing every page.
    return [];
  }
}

// Code is 6 chars, uppercase alphanumeric without easily-confused glyphs
// (no 0/O/1/I). Six chars over 32-char alphabet is ~1B combinations.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// Returns a Prisma `where` clause restricting Match results to what the user
// should see given their active group filter.
//
// - "" (default): public matches + any group the user is in
// - "public":     only matches with groupId == null
// - <groupId>:    only that group's matches, and only if the user is a member
//
// Note: SQL `IN (NULL, ...)` does NOT match NULL rows because NULL is never
// equal to anything in three-valued logic, so we use `OR` to combine null
// matches with the group-id list.
type MatchWhere = {
  groupId?: string | null;
  OR?: { groupId: string | null | { in: string[] } }[];
};

export async function visibleMatchWhere(
  userId: string | null,
  filter: GroupFilter,
): Promise<MatchWhere> {
  if (filter === "public") {
    return { groupId: null };
  }

  if (filter && filter !== "public") {
    if (!userId) return { groupId: null };
    try {
      const isMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: filter, userId } },
      });
      if (!isMember) return { groupId: null };
      return { groupId: filter };
    } catch {
      return { groupId: null };
    }
  }

  // Default: public + user's groups.
  if (!userId) return { groupId: null };
  let groupIds: string[] = [];
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    groupIds = memberships.map((m) => m.groupId);
  } catch {
    return { groupId: null };
  }
  if (groupIds.length === 0) return { groupId: null };
  return {
    OR: [{ groupId: null }, { groupId: { in: groupIds } }],
  };
}
