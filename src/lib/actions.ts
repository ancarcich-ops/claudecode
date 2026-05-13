"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import {
  clearSession,
  getCurrentUser,
  getOrCreateUser,
  requireUser,
  setSession,
} from "./auth";
import { recordOddsSnapshot } from "./match";

export async function signInAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const user = await getOrCreateUser(username);
  setSession(user.id);
  redirect("/");
}

export async function signOutAction() {
  clearSession();
  redirect("/login");
}

type PlayerDraft = { displayName: string; handicap: number };

export async function createMatchAction(formData: FormData) {
  const user = await requireUser();
  const courseName = String(formData.get("courseName") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const holes = Number(formData.get("holes") ?? 18);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!courseName) throw new Error("Course name required");
  if (!scheduledAtRaw) throw new Error("Tee time required");

  const names = formData.getAll("playerName").map((v) => String(v).trim());
  const hcps = formData.getAll("playerHandicap").map((v) => Number(v));

  const drafts: PlayerDraft[] = names
    .map((name, i) => ({ displayName: name, handicap: hcps[i] }))
    .filter((p) => p.displayName.length > 0);

  if (drafts.length < 2) throw new Error("Need at least two players");
  if (drafts.some((p) => Number.isNaN(p.handicap)))
    throw new Error("Handicaps must be numbers");

  const match = await prisma.match.create({
    data: {
      courseName,
      scheduledAt: new Date(scheduledAtRaw),
      holes: holes === 9 ? 9 : 18,
      notes,
      createdById: user.id,
      players: {
        create: drafts.map((p, i) => ({
          displayName: p.displayName,
          handicap: p.handicap,
          seat: i,
          // Link to user if a known username matches the displayName.
          userId: undefined,
        })),
      },
    },
    include: { players: true },
  });

  await recordOddsSnapshot(match.id);
  revalidatePath("/");
  redirect(`/matches/${match.id}`);
}

export async function placeWagerAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId"));
  const pickedPlayerId = String(formData.get("pickedPlayerId"));

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.status === "COMPLETED")
    throw new Error("Match already completed");

  await prisma.wager.upsert({
    where: { matchId_userId: { matchId, userId: user.id } },
    update: { pickedPlayerId },
    create: { matchId, userId: user.id, pickedPlayerId },
  });

  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

export async function startMatchAction(formData: FormData) {
  await requireUser();
  const matchId = String(formData.get("matchId"));
  await prisma.match.update({
    where: { id: matchId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

export async function completeMatchAction(formData: FormData) {
  await requireUser();
  const matchId = String(formData.get("matchId"));
  await prisma.match.update({
    where: { id: matchId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

export async function logScoreAction(formData: FormData) {
  await requireUser();
  const matchId = String(formData.get("matchId"));
  const matchPlayerId = String(formData.get("matchPlayerId"));
  const hole = Number(formData.get("hole"));
  const strokesRaw = formData.get("strokes");

  // Empty string clears a score.
  if (strokesRaw === null || String(strokesRaw).trim() === "") {
    await prisma.scoreEntry
      .delete({ where: { matchPlayerId_hole: { matchPlayerId, hole } } })
      .catch(() => {});
  } else {
    const strokes = Number(strokesRaw);
    if (!Number.isFinite(strokes) || strokes < 1 || strokes > 20)
      throw new Error("Strokes must be 1-20");
    await prisma.scoreEntry.upsert({
      where: { matchPlayerId_hole: { matchPlayerId, hole } },
      update: { strokes },
      create: { matchPlayerId, hole, strokes },
    });
  }

  // Auto-advance to IN_PROGRESS on first score.
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (match && match.status === "UPCOMING") {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  }

  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
}

export async function deleteMatchAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId"));
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return;
  if (match.createdById !== user.id) throw new Error("Not your match");
  await prisma.match.delete({ where: { id: matchId } });
  revalidatePath("/");
  redirect("/");
}

// Re-export for convenience in pages that need to check session.
export { getCurrentUser };
