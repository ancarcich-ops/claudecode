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
import { defaultPars } from "./odds";

export async function signInAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const user = await getOrCreateUser(username);
  if (displayName && displayName !== user.displayName) {
    await prisma.user.update({
      where: { id: user.id },
      data: { displayName },
    });
  }
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
  const holesRaw = Number(formData.get("holes") ?? 18);
  const holes: 9 | 18 = holesRaw === 9 ? 9 : 18;
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

  // Look up users by username (case-insensitive); link player seats when match.
  const lookup = await prisma.user.findMany({
    where: { username: { in: drafts.map((d) => d.displayName.toLowerCase()) } },
  });
  const userByName = new Map(lookup.map((u) => [u.username, u]));

  const match = await prisma.match.create({
    data: {
      courseName,
      scheduledAt: new Date(scheduledAtRaw),
      holes,
      notes,
      parData: JSON.stringify(defaultPars(holes)),
      createdById: user.id,
      players: {
        create: drafts.map((p, i) => {
          const u = userByName.get(p.displayName.toLowerCase());
          return {
            displayName: p.displayName,
            handicap: p.handicap,
            seat: i,
            userId: u?.id,
          };
        }),
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
    throw new Error("Market closed - match already final");

  await prisma.wager.upsert({
    where: { matchId_userId: { matchId, userId: user.id } },
    update: { pickedPlayerId },
    create: { matchId, userId: user.id, pickedPlayerId },
  });

  await prisma.match.update({
    where: { id: matchId },
    data: { updatedAt: new Date() },
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

export async function reopenMatchAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId"));
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { scores: true } } },
  });
  if (!match) throw new Error("Match not found");
  if (match.createdById !== user.id) throw new Error("Not your match");
  const anyScores = match.players.some((p) => p.scores.length > 0);
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: anyScores ? "IN_PROGRESS" : "UPCOMING",
      completedAt: null,
      startedAt: anyScores ? match.startedAt ?? new Date() : null,
    },
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

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (match && match.status === "UPCOMING") {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
  } else if (match) {
    await prisma.match.update({
      where: { id: matchId },
      data: { updatedAt: new Date() },
    });
  }

  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
}

export async function updateHandicapAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId"));
  const matchPlayerId = String(formData.get("matchPlayerId"));
  const handicap = Number(formData.get("handicap"));
  if (!Number.isFinite(handicap)) throw new Error("Handicap must be a number");

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.createdById !== user.id) throw new Error("Not your match");
  await prisma.matchPlayer.update({
    where: { id: matchPlayerId },
    data: { handicap },
  });
  await prisma.match.update({
    where: { id: matchId },
    data: { updatedAt: new Date() },
  });
  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
}

export async function updateParsAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId"));
  const parsRaw = formData.getAll("par").map((v) => Number(v));
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.createdById !== user.id) throw new Error("Not your match");
  if (parsRaw.length !== match.holes)
    throw new Error(`Need ${match.holes} pars, got ${parsRaw.length}`);
  if (parsRaw.some((p) => !Number.isFinite(p) || p < 3 || p > 6))
    throw new Error("Pars must be 3, 4, 5, or 6");

  await prisma.match.update({
    where: { id: matchId },
    data: { parData: JSON.stringify(parsRaw) },
  });
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

export { getCurrentUser };
