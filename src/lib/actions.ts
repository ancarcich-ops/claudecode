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
import { findOrCreateCourseByName } from "./course";
import { assignHoles, fetchOsmGolfFeatures, geocodeCourse } from "./osm";

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
  // Back-9 support: only valid for 9-hole rounds; everything else is hole 1.
  const startingHoleRaw = Number(formData.get("startingHole") ?? 1);
  const startingHole = holes === 9 && startingHoleRaw === 10 ? 10 : 1;
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
      startingHole,
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

// On-course: record the GPS coords of a green point. Accepts a 'position'
// field of 'center' (default), 'front', or 'back' so the front-of-green
// and back-of-green refinements can be marked separately.
//
// Lazily creates the Course row if this is the first contribution for that
// course name. Any signed-in user can mark a green -- we trust them like
// we trust score entries.
export async function markGreenCenterAction(formData: FormData) {
  const user = await requireUser();
  const courseName = String(formData.get("courseName") ?? "").trim();
  const hole = Number(formData.get("hole"));
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const positionRaw = String(formData.get("position") ?? "center").trim();
  const position =
    positionRaw === "front" || positionRaw === "back" ? positionRaw : "center";
  if (!courseName) throw new Error("Course name required");
  if (!Number.isFinite(hole) || hole < 1 || hole > 36) {
    throw new Error("Invalid hole number");
  }
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new Error("Invalid coordinates");
  }
  const course = await findOrCreateCourseByName(courseName);
  const dataFor = (pos: "center" | "front" | "back") => {
    if (pos === "front") return { greenFrontLat: lat, greenFrontLng: lng };
    if (pos === "back") return { greenBackLat: lat, greenBackLng: lng };
    return { greenLat: lat, greenLng: lng };
  };
  const existing = await prisma.courseHole.findUnique({
    where: { courseId_hole: { courseId: course.id, hole } },
  });
  if (existing) {
    await prisma.courseHole.update({
      where: { id: existing.id },
      data: dataFor(position),
    });
  } else {
    await prisma.courseHole.create({
      data: {
        courseId: course.id,
        hole,
        contributedById: user.id,
        ...dataFor(position),
      },
    });
  }
}

// Pull course geometry from OpenStreetMap. Idempotent + cached: once the
// Course row has osmFetchedAt, this no-ops unless forceRefresh=true.
// Safe to call from the server-side page render -- bails fast when cached.
export async function importCourseFromOsm(
  courseName: string,
  totalHoles: number,
  opts: { forceRefresh?: boolean } = {},
): Promise<{ imported: number; hadData: boolean }> {
  const trimmed = courseName.trim();
  if (!trimmed) return { imported: 0, hadData: false };
  const course = await findOrCreateCourseByName(trimmed);
  if (course.osmFetchedAt && !opts.forceRefresh) {
    return {
      imported: 0,
      hadData: !!(course.centerLat && course.centerLng),
    };
  }

  // 1) Geocode if we don't yet have a center
  let center: { lat: number; lng: number } | null =
    course.centerLat != null && course.centerLng != null
      ? { lat: course.centerLat, lng: course.centerLng }
      : null;
  if (!center) {
    const g = await geocodeCourse(trimmed);
    if (g) center = { lat: g.lat, lng: g.lng };
  }
  // No center -> mark as attempted and bail. Course stays user-mappable.
  if (!center) {
    await prisma.course.update({
      where: { id: course.id },
      data: { osmFetchedAt: new Date() },
    });
    return { imported: 0, hadData: false };
  }

  // 2) Pull golf features within ~700m of center
  const features = await fetchOsmGolfFeatures(center.lat, center.lng, 700);
  const assigned = assignHoles(features, totalHoles);

  // 3) Persist tee + green points per hole. Skip holes that the user
  //    has already manually marked -- their mark wins.
  let imported = 0;
  for (const h of assigned) {
    if (h.hole < 1 || h.hole > totalHoles) continue;
    const existing = await prisma.courseHole.findUnique({
      where: { courseId_hole: { courseId: course.id, hole: h.hole } },
    });
    const dataPatch: Record<string, unknown> = {};
    if (h.tee && (!existing || existing.teeLat == null)) {
      dataPatch.teeLat = h.tee.lat;
      dataPatch.teeLng = h.tee.lng;
    }
    if (h.green && (!existing || existing.greenLat == null)) {
      dataPatch.greenLat = h.green.lat;
      dataPatch.greenLng = h.green.lng;
    }
    if (h.greenPolygon && (!existing || existing.greenPolygonJson == null)) {
      dataPatch.greenPolygonJson = JSON.stringify(
        h.greenPolygon.map((p) => [p.lat, p.lng]),
      );
    }
    if (Object.keys(dataPatch).length === 0) continue;
    if (existing) {
      await prisma.courseHole.update({
        where: { id: existing.id },
        data: { ...dataPatch, source: existing.source ?? "osm" },
      });
    } else {
      await prisma.courseHole.create({
        data: {
          courseId: course.id,
          hole: h.hole,
          source: "osm",
          ...dataPatch,
        },
      });
    }
    imported++;
  }

  // 4) Persist non-green polygons as hazards (water + bunkers near holes).
  //    Hole assignment is best-effort: nearest hole within 80m of feature
  //    centroid. This will only run on first import; cleared by manual
  //    deleteHazardAction if it gets noisy.
  const holeAnchors = assigned
    .filter((h) => h.green)
    .map((h) => ({ hole: h.hole, ...(h.green as { lat: number; lng: number }) }));
  for (const f of features) {
    if (f.kind !== "water" && f.kind !== "bunker") continue;
    if (holeAnchors.length === 0) continue;
    let bestHole: number | null = null;
    let bestDist = Infinity;
    for (const a of holeAnchors) {
      const dLat = (f.centroid.lat - a.lat) * 111000;
      const dLng = (f.centroid.lng - a.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180);
      const d = Math.sqrt(dLat * dLat + dLng * dLng);
      if (d < bestDist) {
        bestDist = d;
        bestHole = a.hole;
      }
    }
    if (bestHole == null || bestDist > 80) continue;
    await prisma.courseHazard.create({
      data: {
        courseId: course.id,
        hole: bestHole,
        kind: f.kind === "water" ? "WATER" : "SAND",
        lat: f.centroid.lat,
        lng: f.centroid.lng,
        label: null,
      },
    });
  }

  await prisma.course.update({
    where: { id: course.id },
    data: {
      centerLat: center.lat,
      centerLng: center.lng,
      osmFetchedAt: new Date(),
    },
  });
  return { imported, hadData: imported > 0 };
}

// User-triggered re-import (from the on-course view's 'refresh from OSM'
// button). Allowed for any signed-in user; force-refreshes the cache.
export async function refreshCourseFromOsmAction(formData: FormData) {
  await requireUser();
  const courseName = String(formData.get("courseName") ?? "").trim();
  const totalHoles = Math.max(
    1,
    Math.min(36, Number(formData.get("holes") ?? 18)),
  );
  await importCourseFromOsm(courseName, totalHoles, { forceRefresh: true });
}

// Mark the tee box for a hole. Mirrors markGreenCenterAction.
export async function markTeeAction(formData: FormData) {
  const user = await requireUser();
  const courseName = String(formData.get("courseName") ?? "").trim();
  const hole = Number(formData.get("hole"));
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  if (!courseName) throw new Error("Course name required");
  if (!Number.isFinite(hole) || hole < 1 || hole > 36) {
    throw new Error("Invalid hole number");
  }
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new Error("Invalid coordinates");
  }
  const course = await findOrCreateCourseByName(courseName);
  const existing = await prisma.courseHole.findUnique({
    where: { courseId_hole: { courseId: course.id, hole } },
  });
  if (existing) {
    await prisma.courseHole.update({
      where: { id: existing.id },
      data: { teeLat: lat, teeLng: lng },
    });
  } else {
    await prisma.courseHole.create({
      data: {
        courseId: course.id,
        hole,
        teeLat: lat,
        teeLng: lng,
        contributedById: user.id,
      },
    });
  }
}

// Mark a course hazard with the user's current GPS. v1 stores a single
// representative point per hazard; polygons come later. Caller passes the
// kind ('water' / 'sand' / 'oob' / 'other') and an optional label.
export async function markHazardAction(formData: FormData) {
  const user = await requireUser();
  const courseName = String(formData.get("courseName") ?? "").trim();
  const hole = Number(formData.get("hole"));
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const kindRaw = String(formData.get("kind") ?? "OTHER").toUpperCase();
  const kind =
    kindRaw === "WATER" || kindRaw === "SAND" || kindRaw === "OOB"
      ? kindRaw
      : "OTHER";
  const label = String(formData.get("label") ?? "").trim() || null;
  if (!courseName) throw new Error("Course name required");
  if (!Number.isFinite(hole) || hole < 1 || hole > 36)
    throw new Error("Invalid hole number");
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new Error("Invalid coordinates");
  }
  const course = await findOrCreateCourseByName(courseName);
  await prisma.courseHazard.create({
    data: {
      courseId: course.id,
      hole,
      kind,
      label,
      lat,
      lng,
      contributedById: user.id,
    },
  });
}

// Remove a hazard (mistakes happen, water moves... etc). Anyone signed in
// can delete; bring this back to creator-only if it becomes a problem.
export async function deleteHazardAction(formData: FormData) {
  await requireUser();
  const hazardId = String(formData.get("hazardId") ?? "");
  if (!hazardId) return;
  await prisma.courseHazard
    .delete({ where: { id: hazardId } })
    .catch(() => {});
}

// Avatar customization: pick a generated variant + seed. Always available
// (no external infra). Empty seed -> default to user id (resets to the
// original generated avatar).
export async function updateAvatarConfigAction(formData: FormData) {
  const user = await requireUser();
  const seedRaw = String(formData.get("seed") ?? "").trim();
  const variantRaw = String(formData.get("variant") ?? "beam").trim();
  const allowedVariants = new Set([
    "beam",
    "marble",
    "sunset",
    "pixel",
    "ring",
    "bauhaus",
  ]);
  const variant = allowedVariants.has(variantRaw) ? variantRaw : "beam";
  await prisma.user.update({
    where: { id: user.id },
    data: {
      avatarSeed: seedRaw || null,
      avatarVariant: variant,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/");
}

// Upload a real photo via Vercel Blob. Requires BLOB_READ_WRITE_TOKEN
// in env; the settings UI hides the upload button when missing.
export async function uploadAvatarAction(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file");
  if (file.size > 4 * 1024 * 1024) {
    throw new Error("File too large (max 4 MB)");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Not an image");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "Photo upload not configured. Generated avatars only for now.",
    );
  }
  // Dynamic import so the dependency isn't pulled into routes that don't
  // use it (and so the build doesn't fail when the package would tree-shake
  // out).
  const { put } = await import("@vercel/blob");
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 4);
  const path = `avatars/${user.id}-${Date.now()}.${ext}`;
  const blob = await put(path, file, {
    access: "public",
    contentType: file.type,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: blob.url },
  });
  revalidatePath("/settings");
  revalidatePath("/");
}

// Clear an uploaded photo (falls back to the generated avatar).
export async function clearAvatarUrlAction() {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: null },
  });
  revalidatePath("/settings");
  revalidatePath("/");
}

// One-click "import demo rounds" for the current user. Inserts the six
// reference rounds defined in demoRounds.ts, skipping any (user, course,
// scheduledAt) tuple that already exists -- safe to re-run.
export async function importDemoRoundsAction() {
  const user = await requireUser();
  const { DEMO_ROUNDS, generateScores } = await import("./demoRounds");

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < DEMO_ROUNDS.length; i++) {
    const round = DEMO_ROUNDS[i];

    const existing = await prisma.match.findFirst({
      where: {
        createdById: user.id,
        courseName: round.courseName,
        scheduledAt: round.scheduledAt,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const startingHole = round.startingHole ?? 1;
    const seed = (round.scheduledAt.getTime() % 2147483647) + i;
    const scores = generateScores(round.pars, round.totalOverPar, seed);

    await prisma.match.create({
      data: {
        courseName: round.courseName,
        scheduledAt: round.scheduledAt,
        completedAt: round.scheduledAt,
        startedAt: round.scheduledAt,
        holes: round.pars.length,
        startingHole,
        status: "COMPLETED",
        scoringMode: "NET",
        parData: JSON.stringify(round.pars),
        createdById: user.id,
        players: {
          create: [
            {
              displayName: user.displayName ?? user.username,
              handicap: 14,
              seat: 0,
              userId: user.id,
              scores: {
                create: scores.map((strokes, idx) => ({
                  hole: startingHole + idx,
                  strokes,
                })),
              },
            },
          ],
        },
      },
    });
    created++;
  }

  revalidatePath("/stats");
  revalidatePath("/");
  return { created, skipped };
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
