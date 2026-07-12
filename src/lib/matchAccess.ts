// Who may write scores on a match.
//
// The original rule -- creator OR a seat linked to your account -- locked
// out playing partners, because seats added by name have userId = null.
// So in practice only the round's creator could log scores. This adds the
// natural case: when a round belongs to a group, any member of that group
// (the crew playing together) can keep score for the round. Ad-hoc rounds
// with no group stay creator + linked-seat.

import { prisma } from "./db";

/** True when `userId` belongs to `groupId`. Null group => false. */
export async function isGroupMember(
  groupId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!groupId) return false;
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { userId: true },
  });
  return !!membership;
}

/**
 * Full score-write permission check, given the fields a caller has likely
 * already loaded. Pass the match's createdById, groupId, and its players'
 * userIds; returns whether `userId` may log/clear scores. Only hits the DB
 * (for group membership) when the cheap creator/seat checks miss.
 */
export async function canScoreMatch(
  userId: string,
  match: {
    createdById: string;
    groupId: string | null;
    players: { userId: string | null }[];
  },
): Promise<boolean> {
  if (match.createdById === userId) return true;
  if (match.players.some((p) => p.userId === userId)) return true;
  return isGroupMember(match.groupId, userId);
}
