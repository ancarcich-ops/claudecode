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

// URL-safe slug from a group's display name. Lowercase, dashes for spaces,
// strip everything else. Capped at 32 chars. Empty result falls back to "g".
export function slugifyGroupName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return base || "g";
}

// Find the lowest unused slug starting from `base`. Tries `base`, then
// `base-2`, `base-3`, etc. Caller wraps the eventual insert in a try/catch
// in case of a race; the unique constraint is the source of truth.
export async function uniqueGroupSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // Bounded loop: practically returns on the first or second try.
  while (n < 1000) {
    const existing = await prisma.group.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
  // Fallback if a name is somehow catastrophically common: append a
  // chunk of the invite-code alphabet for entropy.
  return `${base}-${generateInviteCode().toLowerCase()}`;
}

// Look up a group by either its cuid or its slug. Backfills the slug
// lazily so groups created before slugs existed don't stay null forever.
export async function findGroupByIdOrSlug(identifier: string) {
  if (!identifier) return null;
  const group = await prisma.group.findFirst({
    where: { OR: [{ id: identifier }, { slug: identifier }] },
  });
  if (!group) return null;
  if (group.slug) return group;
  // Backfill on read. Race-safe: another concurrent request may win the
  // update; we re-read and use whichever slug landed.
  const slug = await uniqueGroupSlug(slugifyGroupName(group.name));
  try {
    return await prisma.group.update({
      where: { id: group.id },
      data: { slug },
    });
  } catch {
    const fresh = await prisma.group.findUnique({ where: { id: group.id } });
    return fresh ?? group;
  }
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
