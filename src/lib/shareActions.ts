"use server";

// Share-my-round CRUD. Kept out of actions.ts (which is huge); same
// conventions: FormData in, permission-gated, revalidate the match page.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser } from "./auth";
import { geocodeAddress } from "./roundShare";

const VALID_MILESTONES = new Set(["FRONT9", "EVERY6", "FINISH"]);

export async function createRoundShareAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId") ?? "");
  const matchPlayerId = String(formData.get("matchPlayerId") ?? "");
  const includeScores = formData.get("includeScores") === "on";
  const destAddress = String(formData.get("destAddress") ?? "").trim();
  const milestones = formData
    .getAll("milestones")
    .map(String)
    .filter((m) => VALID_MILESTONES.has(m));

  if (!matchId || !matchPlayerId) throw new Error("Missing match/player");
  // Milestones are dormant until SMS delivery lands -- keep sane
  // defaults on the row so it lights up without a backfill.
  if (milestones.length === 0) milestones.push("FRONT9", "FINISH");

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { createdById: true, players: { select: { id: true, userId: true } } },
  });
  if (!match) throw new Error("Match not found");
  const isCreator = match.createdById === user.id;
  const isSeated = match.players.some((p) => p.userId === user.id);
  if (!isCreator && !isSeated) throw new Error("Not your match");
  if (!match.players.some((p) => p.id === matchPlayerId)) {
    throw new Error("That player is not in this match");
  }

  // Geocode the destination once at save time; a failed geocode just
  // means no ETA line in the updates (address kept for display).
  let destLat: number | null = null;
  let destLng: number | null = null;
  if (destAddress) {
    const geo = await geocodeAddress(destAddress);
    if (geo) {
      destLat = geo.lat;
      destLng = geo.lng;
    }
  }

  await prisma.roundShare.create({
    data: {
      matchId,
      matchPlayerId,
      createdById: user.id,
      token: randomBytes(16).toString("hex"),
      recipientEmail: null,
      includeScores,
      milestones: milestones.join(","),
      destAddress: destAddress || null,
      destLat,
      destLng,
    },
  });
  revalidatePath(`/matches/${matchId}`);
}

export async function deleteRoundShareAction(formData: FormData) {
  const user = await requireUser();
  const shareId = String(formData.get("shareId") ?? "");
  const share = await prisma.roundShare.findUnique({
    where: { id: shareId },
    include: { match: { select: { id: true, createdById: true } } },
  });
  if (!share) return;
  if (share.createdById !== user.id && share.match.createdById !== user.id) {
    throw new Error("Not your share");
  }
  await prisma.roundShare.delete({ where: { id: shareId } });
  revalidatePath(`/matches/${share.match.id}`);
}
