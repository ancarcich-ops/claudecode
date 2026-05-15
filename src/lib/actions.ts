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
import { computeAndPersistMatchWinners } from "./matchWinners";
import { defaultPars } from "./odds";
import {
  generateInviteCode,
  setActiveGroupCookie,
  slugifyGroupName,
  uniqueGroupSlug,
  type GroupFilter,
} from "./groups";
import {
  isBbbEventKind,
  isSideGameKind,
  isSnakeEventKind,
  isWolfEventKind,
  parseWolfConfig,
  stringifyWolfConfig,
  type WolfConfig,
  type WolfPushRule,
} from "./sideGames";

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
  await setSession(user.id);
  redirect(next);
}

export async function signOutAction() {
  await clearSession();
  redirect("/login");
}

type PlayerDraft = {
  displayName: string;
  handicap: number;
  explicitUserId?: string | null;
};

export async function createGroupAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name required");
  if (name.length > 40) throw new Error("Group name too long");

  // Try a few times in the (extremely unlikely) event of an invite-code collision.
  let group;
  const slugBase = slugifyGroupName(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const slug = await uniqueGroupSlug(slugBase);
    try {
      group = await prisma.group.create({
        data: {
          name,
          slug,
          inviteCode: code,
          createdById: user.id,
          members: { create: { userId: user.id, role: "owner" } },
        },
      });
      break;
    } catch {
      // unique-constraint retry (either invite code or slug race)
    }
  }
  if (!group) throw new Error("Could not create group");

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
  // playerUserId comes in as a parallel hidden input from PlayerNameInput.
  // Empty string = unlinked (user typed a name freely).
  const explicitUserIds = formData
    .getAll("playerUserId")
    .map((v) => String(v).trim());

  const drafts: PlayerDraft[] = names
    .map((name, i) => ({
      displayName: name,
      handicap: hcps[i],
      explicitUserId: explicitUserIds[i] || null,
    }))
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

  // Side games: parallel checkboxes on the new-match form. Filter to the
  // recognized phase-1 kinds; Nassau is implicitly disabled for 9-hole rounds.
  const sideGameRaw = formData.getAll("sideGame").map((v) => String(v));
  const sideGameKinds = Array.from(
    new Set(
      sideGameRaw
        .filter(isSideGameKind)
        .filter((k) => !(k === "NASSAU" && holes !== 18)),
    ),
  );

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

  // Resolve userIds for each seat. Priority:
  //   1. Explicit userId from the autocomplete (the user picked from the list)
  //   2. Fallback: username == displayName (case-insensitive) for hand-typed
  //      entries that happen to match an account, preserving prior behavior.
  const explicitIds = drafts
    .map((d) => d.explicitUserId)
    .filter((v): v is string => !!v);
  const lookup = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: explicitIds } },
        { username: { in: drafts.map((d) => d.displayName.toLowerCase()) } },
      ],
    },
  });
  const userById = new Map(lookup.map((u) => [u.id, u]));
  const userByName = new Map(lookup.map((u) => [u.username.toLowerCase(), u]));

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
          const explicit = p.explicitUserId
            ? userById.get(p.explicitUserId)
            : undefined;
          const byName = userByName.get(p.displayName.toLowerCase());
          const linked = explicit ?? byName;
          return {
            displayName: p.displayName,
            handicap: p.handicap,
            seat: i,
            userId: linked?.id,
          };
        }),
      },
      sideGames: {
        create: sideGameKinds.map((kind) => ({ kind })),
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
      // Clear the snapshot -- the match is no longer final.
      winnerSummary: null,
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
  // Snapshot per-game winners so leaderboard queries can skip the engine
  // for historical matches.
  await computeAndPersistMatchWinners(matchId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
}

export async function logScoreAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId"));
  const matchPlayerId = String(formData.get("matchPlayerId"));
  const hole = Number(formData.get("hole"));
  const strokesRaw = formData.get("strokes");

  // Permission gate: only the match creator OR a player linked to one of
  // the seats in this match can log/clear scores. Anyone else viewing the
  // match (group members, public viewers) can read but not write.
  const matchPerm = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      createdById: true,
      players: { select: { userId: true } },
    },
  });
  if (!matchPerm) throw new Error("Match not found");
  const isCreator = matchPerm.createdById === user.id;
  const isLinkedPlayer = matchPerm.players.some((p) => p.userId === user.id);
  if (!isCreator && !isLinkedPlayer) {
    throw new Error("Only players in this match can log scores");
  }

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

// Record a per-hole side-game event. Single-award kinds (BINGO/BANGO/BONGO,
// SNAKE_HOLDER, WOLF HOLE_WINNER, etc.) overwrite the previous winner for
// that (sideGame, hole, kind). Empty matchPlayerId clears the award.
export async function recordSideGameEventAction(formData: FormData) {
  const user = await requireUser();
  const sideGameId = String(formData.get("sideGameId") ?? "");
  const hole = Number(formData.get("hole"));
  const kind = String(formData.get("kind") ?? "");
  const matchPlayerId =
    String(formData.get("matchPlayerId") ?? "").trim() || null;

  if (!sideGameId || !Number.isFinite(hole) || hole < 1 || !kind) {
    throw new Error("Invalid side-game event");
  }
  const bbb = isBbbEventKind(kind);
  const snake = isSnakeEventKind(kind);
  const wolf = isWolfEventKind(kind);
  if (!bbb && !snake && !wolf) throw new Error("Unsupported event kind");

  // Confirm the side game belongs to a match we can find AND that the
  // signed-in user is allowed to write (creator or a linked player).
  const sg = await prisma.sideGame.findUnique({
    where: { id: sideGameId },
    select: {
      matchId: true,
      match: {
        select: {
          createdById: true,
          players: { select: { userId: true } },
        },
      },
    },
  });
  if (!sg) throw new Error("Side game not found");
  const isCreator = sg.match.createdById === user.id;
  const isLinkedPlayer = sg.match.players.some((p) => p.userId === user.id);
  if (!isCreator && !isLinkedPlayer) {
    throw new Error("Only players in this match can record events");
  }

  if (bbb) {
    // Single-award kinds: delete any existing rows for this (game, hole, kind)
    // and create the new one if a player was picked.
    await prisma.sideGameEvent.deleteMany({
      where: { sideGameId, hole, kind },
    });
    if (matchPlayerId) {
      await prisma.sideGameEvent.create({
        data: { sideGameId, hole, kind, matchPlayerId },
      });
    }
  } else if (snake) {
    // Multi-player toggle: each (hole, player) is independent. Submitting
    // without a player is a no-op (we wouldn't know who to toggle).
    if (!matchPlayerId) throw new Error("Player required for snake event");
    const existing = await prisma.sideGameEvent.findFirst({
      where: { sideGameId, hole, kind, matchPlayerId },
      select: { id: true },
    });
    if (existing) {
      await prisma.sideGameEvent.delete({ where: { id: existing.id } });
    } else {
      await prisma.sideGameEvent.create({
        data: { sideGameId, hole, kind, matchPlayerId },
      });
    }
  } else if (wolf) {
    // Wolf: PARTNER and LONE_WOLF are mutually exclusive per hole (only one
    // Wolf choice can be active). HOLE_WINNER is its own single-award kind.
    if (kind === "PARTNER" || kind === "LONE_WOLF" || kind === "PRE_LONE_WOLF") {
      await prisma.sideGameEvent.deleteMany({
        where: {
          sideGameId,
          hole,
          kind: { in: ["PARTNER", "LONE_WOLF", "PRE_LONE_WOLF"] },
        },
      });
      if (matchPlayerId) {
        await prisma.sideGameEvent.create({
          data: { sideGameId, hole, kind, matchPlayerId },
        });
      }
    } else if (kind === "HOLE_WINNER" || kind === "PUSH") {
      // Wolf hole outcome: one of WIN (HOLE_WINNER) / PUSH / nothing.
      // Mutex across both kinds -- setting either clears both first.
      await prisma.sideGameEvent.deleteMany({
        where: { sideGameId, hole, kind: { in: ["HOLE_WINNER", "PUSH"] } },
      });
      if (kind === "HOLE_WINNER" && matchPlayerId) {
        await prisma.sideGameEvent.create({
          data: { sideGameId, hole, kind, matchPlayerId },
        });
      } else if (kind === "PUSH") {
        // PUSH carries no matchPlayerId.
        await prisma.sideGameEvent.create({
          data: { sideGameId, hole, kind },
        });
      }
    }
  }

  revalidatePath(`/matches/${sg.matchId}`);
}

// Update the per-match Wolf config (rotation, push rule). Creator-only.
export async function updateWolfConfigAction(formData: FormData) {
  const user = await requireUser();
  const sideGameId = String(formData.get("sideGameId") ?? "");
  const pushRuleRaw = String(formData.get("pushRule") ?? "");
  const rotationRaw = String(formData.get("rotation") ?? "");
  if (!sideGameId) throw new Error("Missing side-game id");

  const sg = await prisma.sideGame.findUnique({
    where: { id: sideGameId },
    select: {
      matchId: true,
      kind: true,
      config: true,
      match: { select: { createdById: true } },
    },
  });
  if (!sg) throw new Error("Side game not found");
  if (sg.kind !== "WOLF") throw new Error("Not a Wolf game");
  if (sg.match.createdById !== user.id)
    throw new Error("Only the match creator can change Wolf settings");

  const current = parseWolfConfig(sg.config);
  const next: WolfConfig = { ...current };

  if (pushRuleRaw === "NO_POINTS" || pushRuleRaw === "ROLLOVER") {
    next.pushRule = pushRuleRaw as WolfPushRule;
  }
  if (rotationRaw) {
    // Comma-separated matchPlayerIds.
    const ids = rotationRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    next.rotation = ids;
  }

  await prisma.sideGame.update({
    where: { id: sideGameId },
    data: { config: stringifyWolfConfig(next) },
  });
  revalidatePath(`/matches/${sg.matchId}`);
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
