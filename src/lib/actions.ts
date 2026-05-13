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
import {
  generateInviteCode,
  setActiveGroupCookie,
  type GroupFilter,
} from "./groups";

export async function signInAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const nextRaw = String(formData.get("next") ?? "").trim();
  // Only honor same-origin relative redirects to avoid open-redirect abuse.
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const user = await getOrCreateUser(username);
  if (displayName && displayName !== user.displayName) {
    await prisma.user.update({
      where: { id: user.id },
      data: { displayName },
    });
  }
  setSession(user.id);
  redirect(next);
}

export async function signOutAction() {
  clearSession();
  redirect("/login");
}

type PlayerDraft = { displayName: string; handicap: number };

export async function createGroupAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name required");
  if (name.length > 40) throw new Error("Group name too long");

  // Try a few times in the (extremely unlikely) event of an invite-code collision.
  let group;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      group = await prisma.group.create({
        data: {
          name,
          inviteCode: code,
          createdById: user.id,
          members: { create: { userId: user.id, role: "owner" } },
        },
      });
      break;
    } catch {
      // unique-constraint retry
    }
  }
  if (!group) throw new Error("Could not generate a unique invite code");

  setActiveGroupCookie(group.id);
  revalidatePath("/");
  redirect("/groups");
}

export async function joinGroupAction(formData: FormData) {
  const user = await requireUser();
  const codeRaw = String(formData.get("inviteCode") ?? "").trim().toUpperCase();
  if (!codeRaw) throw new Error("Invite code required");

  const group = await prisma.group.findUnique({
    where: { inviteCode: codeRaw },
  });
  if (!group) throw new Error("Invalid invite code");

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: user.id } },
    update: {},
    create: { groupId: group.id, userId: user.id },
  });

  setActiveGroupCookie(group.id);
  revalidatePath("/");
  redirect("/groups");
}

export async function leaveGroupAction(formData: FormData) {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return;
  await prisma.groupMember
    .delete({
      where: { groupId_userId: { groupId, userId: user.id } },
    })
    .catch(() => {});
  // Clear the active-group cookie if it pointed at the group we just left.
  setActiveGroupCookie("");
  revalidatePath("/");
  redirect("/groups");
}

export async function selectGroupAction(formData: FormData) {
  await requireUser();
  const raw = String(formData.get("groupId") ?? "");
  // Allowed values: "" (all), "public", or a real group id. We don't verify
  // membership here -- visibleMatchWhere() degrades gracefully if the user
  // isn't a member, and they'd see nothing.
  const value: GroupFilter = raw === "public" ? "public" : raw;
  setActiveGroupCookie(value);
  revalidatePath("/");
}

export async function createMatchAction(formData: FormData) {
  const user = await requireUser();
  const courseName = String(formData.get("courseName") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const holesRaw = Number(formData.get("holes") ?? 18);
  const holes: 9 | 18 = holesRaw === 9 ? 9 : 18;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const parDataRaw = String(formData.get("parData") ?? "").trim();
  const scoringModeRaw = String(formData.get("scoringMode") ?? "NET");
  const scoringMode =
    scoringModeRaw === "GROSS" || scoringModeRaw === "CUSTOM"
      ? scoringModeRaw
      : "NET";

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

  // parData arrives as a JSON-encoded number array from the autocomplete-
  // matched course preset. Validate it - bad/missing values fall back to
  // the engine's standard default.
  let parData: string | null = null;
  if (parDataRaw) {
    try {
      const parsed = JSON.parse(parDataRaw);
      if (
        Array.isArray(parsed) &&
        parsed.length === holes &&
        parsed.every((p) => Number.isFinite(p) && p >= 3 && p <= 6)
      ) {
        parData = JSON.stringify(parsed.map((p) => Math.round(p)));
      }
    } catch {
      parData = null;
    }
  }
  if (!parData) parData = JSON.stringify(defaultPars(holes));

  // Optional group scoping. Empty string / "public" -> public (groupId null).
  // Any other value must be a group the user is a member of, otherwise we
  // silently drop it back to public rather than 500.
  const groupIdRaw = String(formData.get("groupId") ?? "").trim();
  let groupId: string | null = null;
  if (groupIdRaw && groupIdRaw !== "public") {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: groupIdRaw, userId: user.id } },
    });
    if (membership) groupId = groupIdRaw;
  }

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
      parData,
      scoringMode,
      createdById: user.id,
      groupId,
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
