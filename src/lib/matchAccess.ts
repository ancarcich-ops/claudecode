// Match permission bars. Two distinct levels:
//
//   * PARTICIPANT (write): the creator or an actual player in the round.
//     May enter/clear scores and record per-hole side-game events.
//   * VIEWER (read): a participant OR any member of the round's group.
//     Group members can watch a crew round (it shows in their feed) but
//     cannot score it.
//
// The earlier "any group member can score" rule was too broad -- it let
// people edit rounds they aren't playing in. Scoring is now participant-
// only; group membership only grants read access.

import { prisma } from "./db";

type AccessUser = {
  id: string;
  username: string;
  displayName?: string | null;
};

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
 * WRITE bar: is this user actually in the round? True for the creator, a
 * seat linked to their account (userId), or a seat carrying their unique
 * @username -- the same username==displayName heuristic the create flow
 * uses to link seats, so a name-only seat still resolves to its player.
 * Group members who aren't playing are intentionally excluded.
 */
export function isMatchParticipant(
  user: AccessUser,
  match: {
    createdById: string;
    players: { userId: string | null; displayName: string }[];
  },
): boolean {
  if (match.createdById === user.id) return true;
  const handle = user.username.trim().toLowerCase();
  return match.players.some(
    (p) =>
      p.userId === user.id ||
      p.displayName.trim().toLowerCase() === handle,
  );
}

/**
 * READ bar: may this user view the round? Any participant, plus any member
 * of the round's group (crew rounds are visible to the crew). Async only
 * because the group-membership check hits the DB when the cheap
 * participant checks miss.
 */
export async function canViewMatch(
  user: AccessUser,
  match: {
    createdById: string;
    groupId: string | null;
    players: { userId: string | null; displayName: string }[];
  },
): Promise<boolean> {
  if (isMatchParticipant(user, match)) return true;
  return isGroupMember(match.groupId, user.id);
}
