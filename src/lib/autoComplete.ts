// Auto-completion for abandoned-but-finished rounds. People finish 18,
// pocket the phone, and never tap "Mark final" -- the match sits LIVE
// on the home feed forever. Rule: an IN_PROGRESS match where EVERY
// player has a score on EVERY hole, with no activity for an hour, gets
// closed automatically through the same steps as the manual action.
//
// Trigger model: lazy sweep on the home feed + match page (zero infra,
// closes the match the moment anyone looks), with a daily Vercel cron
// as the backstop for matches nobody revisits.

import { prisma } from "./db";
import { recordOddsSnapshot } from "./match";
import { computeAndPersistMatchWinners } from "./matchWinners";

const STALE_MS = 60 * 60 * 1000; // 1 hour of no activity

// Tournament auto-completion rollup, shared with completeMatchAction:
// a round is fully complete when every foursome in it is COMPLETED;
// when fully-complete rounds reach roundsPlanned, the tournament flips.
export async function rollupTournamentCompletion(
  tournamentId: string,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      roundsPlanned: true,
      status: true,
      matches: { select: { status: true, roundNumber: true } },
    },
  });
  if (!tournament || tournament.status === "COMPLETED") return;
  const byRound = new Map<number, { total: number; done: number }>();
  for (const m of tournament.matches) {
    if (m.roundNumber == null) continue;
    const cur = byRound.get(m.roundNumber) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (m.status === "COMPLETED") cur.done += 1;
    byRound.set(m.roundNumber, cur);
  }
  const fullyCompleteRounds = Array.from(byRound.values()).filter(
    (r) => r.total > 0 && r.total === r.done,
  ).length;
  if (fullyCompleteRounds >= tournament.roundsPlanned) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }
}

// The same finalization steps as completeMatchAction, minus auth (the
// completeness + staleness checks are the authorization here).
async function finalizeMatch(matchId: string, completedAt: Date) {
  const completed = await prisma.match.update({
    where: { id: matchId },
    data: { status: "COMPLETED", completedAt },
    select: { tournamentId: true },
  });
  await recordOddsSnapshot(matchId);
  await computeAndPersistMatchWinners(matchId);
  if (completed.tournamentId) {
    await rollupTournamentCompletion(completed.tournamentId);
  }
}

// Sweep for auto-completable matches. Pass a matchId to scope the check
// to one match (match-page load); omit for a global sweep (home feed,
// cron). Returns how many matches were closed.
export async function autoCompleteStaleMatches(
  matchId?: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const candidates = await prisma.match.findMany({
    where: {
      status: "IN_PROGRESS",
      updatedAt: { lt: cutoff },
      ...(matchId ? { id: matchId } : {}),
    },
    select: {
      id: true,
      holes: true,
      updatedAt: true,
      players: { select: { scores: { select: { hole: true } } } },
    },
    take: 25,
  });
  let closed = 0;
  for (const m of candidates) {
    if (m.players.length === 0) continue;
    // "Properly logged" = every player has a score on every hole.
    const full = m.players.every(
      (p) => new Set(p.scores.map((s) => s.hole)).size >= m.holes,
    );
    if (!full) continue;
    try {
      // completedAt = last activity, not sweep time -- the card should
      // read as finishing when they actually finished.
      await finalizeMatch(m.id, m.updatedAt);
      closed++;
    } catch {
      // Never let the sweep break a page render; the next sweep retries.
    }
  }
  return closed;
}
