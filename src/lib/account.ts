// Account deletion — the in-app "delete my account" path required by
// App Store Guideline 5.1.1(v) and general privacy hygiene. Shared by
// the web settings action and the mobile DELETE /me endpoint so both
// behave identically.
//
// Approach: full teardown + anonymize. A user is entangled with shared
// records — matches/groups/tournaments they CREATED belong to everyone
// in them, and those foreign keys are required, so a hard row delete
// would either fail or wipe other players' data. Instead we:
//   - delete everything that authenticates them (sessions incl. the
//     mobile bearer, passkeys, reset tokens) so they're logged out
//     everywhere and can never sign back in,
//   - delete their social + membership rows (follows, group members)
//     and their crowd calls (wagers),
//   - unlink their match/tournament participation (userId -> null) so
//     the seats, names and scores other players see stay intact but are
//     no longer tied to an account,
//   - scrub the account row of every piece of personal data and null
//     the password, leaving only an anonymized, un-loginable placeholder
//     so the createdBy foreign keys on shared content stay valid.
//
// After this the account holds no personal data and cannot be accessed.

import { prisma } from "./db";

export async function deleteAccount(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. Auth teardown — logs out web + mobile, kills all re-entry paths.
    await tx.session.deleteMany({ where: { userId } });
    await tx.passkey.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });

    // 2. Social graph + group memberships.
    await tx.follow.deleteMany({
      where: { OR: [{ followerId: userId }, { followeeId: userId }] },
    });
    await tx.groupMember.deleteMany({ where: { userId } });

    // 3. Crowd calls (a required relation, so remove rather than unlink).
    await tx.wager.deleteMany({ where: { userId } });

    // 4. Unlink participation — keep the seats/names/scores for the other
    //    players, but detach them from the account.
    await tx.matchPlayer.updateMany({
      where: { userId },
      data: { userId: null },
    });
    await tx.tournamentPlayer.updateMany({
      where: { userId },
      data: { userId: null },
    });

    // 5. Scrub the account row. username is set to a unique, non-PII
    //    placeholder (freeing the original handle); email/password are
    //    nulled so it can never be logged into or matched.
    await tx.user.update({
      where: { id: userId },
      data: {
        username: `deleted_${userId}`,
        email: null,
        passwordHash: null,
        displayName: null,
        avatarUrl: null,
        avatarSeed: null,
        avatarVariant: null,
        ghinNumber: null,
        phone: null,
        targetIndex: null,
        autoAcceptFollows: false,
      },
    });
  });
}
