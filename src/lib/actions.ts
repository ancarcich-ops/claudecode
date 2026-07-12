"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { writeSideGameEvent } from "./sideGameEvents";
import { randomBytes } from "node:crypto";
import {
  clearSession,
  getCurrentUser,
  requireUser,
  setSession,
} from "./auth";
import { hashPassword, verifyPassword, passwordError } from "./password";
import { sendEmail, passwordResetEmail, appUrl } from "./email";
import { recordOddsSnapshot } from "./match";
import { checkRoundShares } from "./roundShare";
import { rollupTournamentCompletion } from "./autoComplete";
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
  isMatchEventKind,
  isWolfEventKind,
  parseWolfConfig,
  stringifyWolfConfig,
  type SideGameKind,
  type WolfConfig,
  type WolfPushRule,
} from "./sideGames";
import { findOrCreateCourseByName, distanceYards } from "./course";
import { assignHoles, fetchOsmGolfFeatures, geocodeCourse } from "./osm";

// Same-origin relative redirect guard (avoids open-redirect abuse).
function safeNext(raw: string): string {
  const v = raw.trim();
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const USERNAME_RE = /^[A-Za-z0-9._-]{2,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Auth results are returned (not thrown) so the form pages can show a
// friendly inline error. Most successful actions redirect and never
// return; the password-reset *request* returns { ok: true } so its
// page can show a "check your email" confirmation.
type AuthResult = { error: string } | { ok: true } | undefined;

export async function signUpAction(_prev: AuthResult, formData: FormData): Promise<AuthResult> {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!USERNAME_RE.test(username)) {
    return { error: "Username must be 2-20 chars: letters, numbers, . _ -" };
  }
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  const pwErr = passwordError(password);
  if (pwErr) return { error: pwErr };

  // Uniqueness checks. email is stored lowercased so an exact match is
  // effectively case-insensitive; username is matched exactly. (We
  // avoid Prisma's `mode: "insensitive"` since it's Postgres-only and
  // the dev client is generated from the SQLite schema.)
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });
  if (existing) {
    if (existing.email === email) {
      return { error: "An account with that email already exists." };
    }
    return { error: "That username is taken." };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, displayName },
  });
  await setSession(user.id);
  redirect(next);
}

export async function signInAction(_prev: AuthResult, formData: FormData): Promise<AuthResult> {
  // Accept either username or email in the single "identifier" field.
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!identifier || !password) {
    return { error: "Enter your username/email and password." };
  }
  const isEmail = identifier.includes("@");
  const user = await prisma.user.findFirst({
    where: isEmail
      ? { email: identifier.toLowerCase() }
      : { username: identifier },
  });
  // Generic error -- don't reveal whether the account exists.
  const ok = user && (await verifyPassword(password, user.passwordHash));
  if (!ok) return { error: "Incorrect username/email or password." };
  await setSession(user.id);
  redirect(next);
}

export async function requestPasswordResetAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  const user = await prisma.user.findFirst({
    where: { email },
  });
  // Always behave the same whether or not the account exists, so this
  // endpoint can't be used to enumerate registered emails. Only mint +
  // send when the user actually exists.
  if (user) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });
    const resetUrl = `${appUrl()}/reset-password?token=${token}`;
    const msg = passwordResetEmail(resetUrl);
    await sendEmail({ to: email, ...msg });
  }
  // No redirect -- the page shows a "check your email" confirmation
  // regardless of whether the account existed (anti-enumeration).
  return { ok: true };
}

export async function resetPasswordAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!token) return { error: "Missing reset token." };
  const pwErr = passwordError(password);
  if (pwErr) return { error: pwErr };

  const row = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired." };
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other outstanding sessions + reset tokens for this
    // user so a compromised password can't linger.
    prisma.session.deleteMany({ where: { userId: row.userId } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  await setSession(row.userId);
  redirect("/");
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
  let scoringMode: "NET" | "GROSS" | "CUSTOM" =
    scoringModeRaw === "GROSS" || scoringModeRaw === "CUSTOM"
      ? scoringModeRaw
      : "NET";

  // Format + scramble config. The new-match form posts format
  // ("INDIVIDUAL" | "SCRAMBLE") and a JSON scrambleConfig blob; we
  // re-parse via the canonical helper to apply defaults + strip any
  // junk the client tried to slip in. scoringMode is forced to GROSS
  // for scrambles -- team-handicap mode (held in scrambleConfig)
  // does the actual allowance math.
  const formatRaw = String(formData.get("format") ?? "INDIVIDUAL");
  const format: "INDIVIDUAL" | "SCRAMBLE" =
    formatRaw === "SCRAMBLE" ? "SCRAMBLE" : "INDIVIDUAL";
  let scrambleConfigJson: string | null = null;
  if (format === "SCRAMBLE") {
    const scrambleRaw = String(formData.get("scrambleConfig") ?? "");
    const { parseScrambleConfig } = await import("./scramble");
    scrambleConfigJson = JSON.stringify(parseScrambleConfig(scrambleRaw));
    scoringMode = "GROSS";
  }

  if (!courseName) throw new Error("Course name required");
  if (!scheduledAtRaw) throw new Error("Tee time required");

  // Course must match an entry in our pre-mapped catalog. Free-text
  // course names are no longer accepted -- users pick from the list
  // or contact support to request a missing course.
  {
    const { COURSE_PRESETS } = await import("./courses");
    const matched = COURSE_PRESETS.some(
      (p) => p.name.toLowerCase() === courseName.toLowerCase(),
    );
    if (!matched) {
      throw new Error(
        "Course not in catalog. Pick from the list, or reach out to support to add it.",
      );
    }
  }

  const names = formData.getAll("playerName").map((v) => String(v).trim());
  const hcps = formData.getAll("playerHandicap").map((v) => Number(v));
  // playerUserId comes in as a parallel hidden input from PlayerNameInput.
  // Empty string = unlinked (user typed a name freely).
  const explicitUserIds = formData
    .getAll("playerUserId")
    .map((v) => String(v).trim());
  // Team assignments. Always submitted (even on individual matches);
  // only honoured server-side when format === SCRAMBLE. Anything not
  // 0 or 1 silently coerces to 0.
  const teamsRaw = formData.getAll("playerTeam").map((v) => Number(v));
  // Tee played, for the WHS rating snapshot. Parallel hidden inputs
  // ("Blue|M"). Empty = use the course default tee.
  const teesRaw = formData.getAll("playerTee").map((v) => String(v));

  const drafts: (PlayerDraft & { team: 0 | 1; tee: string | null })[] = names
    .map((name, i) => ({
      displayName: name,
      handicap: hcps[i],
      explicitUserId: explicitUserIds[i] || null,
      team: (teamsRaw[i] === 1 ? 1 : 0) as 0 | 1,
      tee: teesRaw[i]?.trim() || null,
    }))
    .filter((p) => p.displayName.length > 0);

  // Solo rounds are allowed -- the user just won't get competitive
  // counters (win rate / streak / side-game wins are gated on 2+
  // players elsewhere in the app).
  if (drafts.length < 1) throw new Error("Need at least one player");
  if (drafts.some((p) => Number.isNaN(p.handicap)))
    throw new Error("Handicaps must be numbers");

  // Belt-and-braces dedupe of linked Sticks accounts. The client
  // PlayerNameInput already filters duplicate user ids out of the
  // autocomplete; this catches the case where a user types two
  // matching names or comes in via a hand-crafted POST.
  const linkedSet = new Set<string>();
  for (const d of drafts) {
    if (!d.explicitUserId) continue;
    if (linkedSet.has(d.explicitUserId)) {
      throw new Error(
        "Same player is in this round twice. Each linked account can only fill one slot.",
      );
    }
    linkedSet.add(d.explicitUserId);
  }

  // Scramble requires at least one player on each team. A 4-person
  // round that left everyone on Team A would otherwise create a
  // valid-but-broken match (one team with 0 captain, odds engine
  // synthesises a single player only).
  if (format === "SCRAMBLE") {
    if (drafts.length < 2) throw new Error("Teams format needs at least 2 players");
    const aCount = drafts.filter((d) => d.team === 0).length;
    const bCount = drafts.filter((d) => d.team === 1).length;
    if (aCount === 0 || bCount === 0) {
      throw new Error("Each team needs at least one player");
    }
  }

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
  if (!parData) {
    // Before falling back to the generic default layout, check if the
    // course has a saved "master pars" snapshot (set via the per-match
    // ParsEditor's "Save as course default" button). If the length
    // matches the round's hole count, use it -- nice for casual users
    // who have edited a course's pars once and don't want to do it
    // again every time they post a round there.
    const masterCourse = await prisma.course.findUnique({
      where: { name: courseName },
      select: { parData: true },
    });
    if (masterCourse?.parData) {
      try {
        const parsed = JSON.parse(masterCourse.parData);
        if (
          Array.isArray(parsed) &&
          parsed.length === holes &&
          parsed.every((p) => Number.isFinite(p) && p >= 3 && p <= 6)
        ) {
          parData = JSON.stringify(parsed.map((p) => Math.round(p)));
        }
      } catch {
        // ignore -- generic fallback below will catch it
      }
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

  // Tee rating/slope snapshot per player, from the course tee set
  // (fetched once). The form posts "Blue|M"; empty -> course default.
  const { getCourseTeeSet } = await import("./courseTees");
  const teeSet = await getCourseTeeSet(courseName);
  const teeSnapshot = (raw: string | null) => {
    if (teeSet.tees.length === 0) return null;
    const [rawName, rawGender] = (raw ?? "").split("|");
    const wanted = (rawName?.trim() || teeSet.defaultTeeName || "").toLowerCase();
    const g = rawGender === "W" ? "W" : rawGender === "M" ? "M" : null;
    const tee =
      (g &&
        teeSet.tees.find(
          (t) => t.name.toLowerCase() === wanted && t.gender === g,
        )) ||
      teeSet.tees.find((t) => t.name.toLowerCase() === wanted && t.gender === "M") ||
      teeSet.tees.find((t) => t.name.toLowerCase() === wanted) ||
      teeSet.tees.find((t) => t.name === teeSet.defaultTeeName) ||
      teeSet.tees[0];
    return tee
      ? { teeName: tee.name, courseRating: tee.rating, slope: tee.slope }
      : null;
  };

  // Tournament binding. When `tournamentId` is in the form, the new
  // match is round N of that tournament. roundNumber is either
  // supplied explicitly or auto-computed as max(existing) + 1. We
  // also bump the tournament's status from UPCOMING -> IN_PROGRESS
  // the first time a round lands, so the group page chip flips.
  const tournamentIdRaw = String(formData.get("tournamentId") ?? "").trim();
  let tournamentId: string | null = null;
  let roundNumber: number | null = null;
  if (tournamentIdRaw) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentIdRaw },
      include: {
        matches: { select: { roundNumber: true } },
      },
    });
    if (tournament) {
      // Public tournament: anyone can add rounds (mirrors public
      // matches). Group-scoped: only members can.
      let allowed = !tournament.groupId;
      if (!allowed && tournament.groupId) {
        const membership = await prisma.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId: tournament.groupId,
              userId: user.id,
            },
          },
        });
        allowed = !!membership;
      }
      if (allowed) {
        tournamentId = tournament.id;
        const supplied = parseInt(
          String(formData.get("roundNumber") ?? ""),
          10,
        );
        if (Number.isFinite(supplied) && supplied > 0) {
          roundNumber = supplied;
        } else {
          const maxExisting = tournament.matches.reduce(
            (m, r) => Math.max(m, r.roundNumber ?? 0),
            0,
          );
          roundNumber = maxExisting + 1;
        }
      }
    }
  }

  const match = await prisma.match.create({
    data: {
      courseName,
      scheduledAt: new Date(scheduledAtRaw),
      holes,
      startingHole,
      notes,
      parData,
      scoringMode,
      format,
      scrambleConfig: scrambleConfigJson,
      createdById: user.id,
      groupId,
      tournamentId,
      roundNumber,
      players: {
        create: drafts.map((p, i) => {
          const explicit = p.explicitUserId
            ? userById.get(p.explicitUserId)
            : undefined;
          const byName = userByName.get(p.displayName.toLowerCase());
          const linked = explicit ?? byName;
          const tee = teeSnapshot(p.tee);
          return {
            displayName: p.displayName,
            handicap: p.handicap,
            seat: i,
            userId: linked?.id,
            // Team only meaningful for SCRAMBLE; null for individual
            // keeps the DB clean + queries on individual matches don't
            // need to filter by team.
            team: format === "SCRAMBLE" ? p.team : null,
            teeName: tee?.teeName ?? null,
            courseRating: tee?.courseRating ?? null,
            slope: tee?.slope ?? null,
          };
        }),
      },
      sideGames: {
        create: sideGameKinds.map((kind) => ({ kind })),
      },
    },
    include: { players: true },
  });

  // Team-vs-Team side game config: build now that we have real
  // matchPlayerIds. The team picker on the new-match form uses
  // the same playerTeam[] hidden inputs as the scramble format
  // (single source of truth), so we read those off the drafts
  // we already validated.
  if (sideGameKinds.includes("TEAM_VS_TEAM")) {
    const {
      TEAM_VS_TEAM_RULES,
      stringifyTeamVsTeamConfig,
      parseTeamVsTeamConfig,
    } = await import("./sideGames");
    type TvtRule = (typeof TEAM_VS_TEAM_RULES)[number];
    const teamPlayers: Record<0 | 1, string[]> = { 0: [], 1: [] };
    for (let i = 0; i < match.players.length && i < drafts.length; i++) {
      const t = drafts[i].team;
      teamPlayers[t].push(match.players[i].id);
    }
    if (teamPlayers[0].length > 0 && teamPlayers[1].length > 0) {
      // New form posts a single JSON tvtConfig with rules[]; the parser
      // also handles a legacy single-rule shape for safety. Default to
      // a single BEST_BALL rule if anything is malformed.
      const rawTvt = String(formData.get("tvtConfig") ?? "");
      let parsedRules: { rule: TvtRule; stake?: number; vegas?: unknown }[] = [];
      if (rawTvt) {
        const parsed = parseTeamVsTeamConfig(
          JSON.stringify({ teams: teamPlayers, ...JSON.parse(rawTvt) }),
        );
        if (parsed && parsed.rules.length > 0) parsedRules = parsed.rules;
      }
      if (parsedRules.length === 0) parsedRules = [{ rule: "BEST_BALL" }];
      await prisma.sideGame.update({
        where: {
          matchId_kind: { matchId: match.id, kind: "TEAM_VS_TEAM" },
        },
        data: {
          config: stringifyTeamVsTeamConfig({
            teams: teamPlayers,
            rules: parsedRules as never,
          }),
        },
      });
    }
  }

  // Match: read inline form config and persist on SideGame.config.
  // The form sends manualStrokesByIndex aligned to the player draft
  // order; map it onto the matchPlayerIds created above.
  if (sideGameKinds.includes("MATCH")) {
    const raw = String(formData.get("matchConfig") ?? "");
    if (raw) {
      const { stringifyMatchConfig } = await import("./sideGames");
      try {
        const obj = JSON.parse(raw);
        const strokesMode: "AUTO" | "MANUAL" =
          obj?.strokesMode === "MANUAL" ? "MANUAL" : "AUTO";
        const manualStrokes: Record<string, number> = {};
        if (
          strokesMode === "MANUAL" &&
          Array.isArray(obj?.manualStrokesByIndex)
        ) {
          for (
            let i = 0;
            i < match.players.length && i < obj.manualStrokesByIndex.length;
            i++
          ) {
            const v = obj.manualStrokesByIndex[i];
            if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
              manualStrokes[match.players[i].id] = Math.floor(v);
            }
          }
        }
        const autoPress = obj?.autoPress === true;
        const rawThreshold = Number(obj?.autoPressThreshold);
        const autoPressThreshold =
          autoPress && Number.isFinite(rawThreshold) && rawThreshold >= 1
            ? Math.floor(rawThreshold)
            : undefined;
        const stakeNum = Number(obj?.stake);
        const stake =
          Number.isFinite(stakeNum) && stakeNum > 0 ? stakeNum : undefined;
        await prisma.sideGame.update({
          where: { matchId_kind: { matchId: match.id, kind: "MATCH" } },
          data: {
            config: stringifyMatchConfig({
              strokesMode,
              manualStrokes,
              autoPress,
              ...(autoPressThreshold ? { autoPressThreshold } : {}),
              ...(stake ? { stake } : {}),
            }),
          },
        });
      } catch {
        // Malformed -- leave SideGame.config null; compute falls back
        // to AUTO with the match-level scoringMode.
      }
    }
  }

  // Sixes: stake-only config for v1.
  if (sideGameKinds.includes("SIXES")) {
    const raw = String(formData.get("sixesConfig") ?? "");
    if (raw) {
      const { stringifySixesConfig } = await import("./sideGames");
      try {
        const obj = JSON.parse(raw);
        const stakeNum = Number(obj?.stake);
        const stake =
          Number.isFinite(stakeNum) && stakeNum > 0 ? stakeNum : undefined;
        if (stake) {
          await prisma.sideGame.update({
            where: { matchId_kind: { matchId: match.id, kind: "SIXES" } },
            data: { config: stringifySixesConfig({ stake }) },
          });
        }
      } catch {
        // Malformed -- leave config null.
      }
    }
  }

  // Targets: read inline form config and persist on SideGame.config.
  if (sideGameKinds.includes("TARGETS")) {
    const raw = String(formData.get("targetsConfig") ?? "");
    if (raw) {
      const { parseTargetsConfig, stringifyTargetsConfig } = await import(
        "./sideGames"
      );
      const parsed = parseTargetsConfig(raw);
      if (parsed && parsed.target > 0) {
        await prisma.sideGame.update({
          where: { matchId_kind: { matchId: match.id, kind: "TARGETS" } },
          data: { config: stringifyTargetsConfig(parsed) },
        });
      }
    }
  }

  // Skins + Wolf push-rule configs. Always persist when the game is
  // enabled, even with the default rule -- makes recap pages reflect
  // exactly what the players agreed to and is cheap.
  if (sideGameKinds.includes("SKINS")) {
    const raw = String(formData.get("skinsConfig") ?? "");
    if (raw) {
      const { parseSkinsConfig, stringifySkinsConfig } = await import(
        "./sideGames"
      );
      const parsed = parseSkinsConfig(raw);
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId: match.id, kind: "SKINS" } },
        data: { config: stringifySkinsConfig(parsed) },
      });
    }
  }
  if (sideGameKinds.includes("WOLF")) {
    const raw = String(formData.get("wolfConfig") ?? "");
    if (raw) {
      const { parseWolfConfig, stringifyWolfConfig } = await import(
        "./sideGames"
      );
      const parsed = parseWolfConfig(raw);
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId: match.id, kind: "WOLF" } },
        data: { config: stringifyWolfConfig(parsed) },
      });
    }
  }
  // Stableford scoring table (WHS vs modified). Persist whenever the
  // game is on so recaps show the agreed scale.
  if (sideGameKinds.includes("STABLEFORD")) {
    const raw = String(formData.get("stablefordConfig") ?? "");
    if (raw) {
      const { parseStablefordConfig, stringifyStablefordConfig } = await import(
        "./sideGames"
      );
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId: match.id, kind: "STABLEFORD" } },
        data: { config: stringifyStablefordConfig(parseStablefordConfig(raw)) },
      });
    }
  }
  // BBB per-event stakes.
  if (sideGameKinds.includes("BBB")) {
    const raw = String(formData.get("bbbConfig") ?? "");
    if (raw) {
      const { parseBbbConfig, stringifyBbbConfig } = await import(
        "./sideGames"
      );
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId: match.id, kind: "BBB" } },
        data: { config: stringifyBbbConfig(parseBbbConfig(raw)) },
      });
    }
  }
  // Snake stake + doubling.
  if (sideGameKinds.includes("SNAKE")) {
    const raw = String(formData.get("snakeConfig") ?? "");
    if (raw) {
      const { parseSnakeConfig, stringifySnakeConfig } = await import(
        "./sideGames"
      );
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId: match.id, kind: "SNAKE" } },
        data: { config: stringifySnakeConfig(parseSnakeConfig(raw)) },
      });
    }
  }

  await recordOddsSnapshot(match.id);

  // Bump the tournament status when its first round lands so the
  // group page chip flips UPCOMING -> IN_PROGRESS.
  if (tournamentId) {
    await prisma.tournament.updateMany({
      where: { id: tournamentId, status: "UPCOMING" },
      data: { status: "IN_PROGRESS" },
    });
    revalidatePath(`/tournaments/${tournamentId}`);
  }

  revalidatePath("/");
  redirect(`/matches/${match.id}`);
}

// Edit an UPCOMING match in place. Reuses the new-match wizard (pre-filled)
// and the exact same field serialization as createMatchAction. Players are
// reconciled by seat so surviving seats keep their MatchPlayer.id -- which
// means any wagers / odds history / side-game config that reference those
// ids stay valid. Only the match creator may edit, and only before the
// match starts (status === "UPCOMING", no scores logged).
export async function editMatchAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId") ?? "").trim();
  if (!matchId) throw new Error("Match id required");

  const existing = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      players: { orderBy: { seat: "asc" }, include: { scores: true } },
      sideGames: true,
    },
  });
  if (!existing) throw new Error("Match not found");
  if (existing.createdById !== user.id) throw new Error("Not your match");
  if (existing.status !== "UPCOMING") {
    throw new Error("Only matches that haven't started can be edited");
  }
  if (existing.players.some((p) => p.scores.length > 0)) {
    throw new Error("Scores have been logged -- this match can no longer be edited");
  }

  // ---- Parse form (identical shape to createMatchAction) ----
  const courseName = String(formData.get("courseName") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const holesRaw = Number(formData.get("holes") ?? 18);
  const holes: 9 | 18 = holesRaw === 9 ? 9 : 18;
  const startingHoleRaw = Number(formData.get("startingHole") ?? 1);
  const startingHole = holes === 9 && startingHoleRaw === 10 ? 10 : 1;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const parDataRaw = String(formData.get("parData") ?? "").trim();
  const scoringModeRaw = String(formData.get("scoringMode") ?? "NET");
  let scoringMode: "NET" | "GROSS" | "CUSTOM" =
    scoringModeRaw === "GROSS" || scoringModeRaw === "CUSTOM"
      ? scoringModeRaw
      : "NET";

  const formatRaw = String(formData.get("format") ?? "INDIVIDUAL");
  const format: "INDIVIDUAL" | "SCRAMBLE" =
    formatRaw === "SCRAMBLE" ? "SCRAMBLE" : "INDIVIDUAL";
  let scrambleConfigJson: string | null = null;
  if (format === "SCRAMBLE") {
    const scrambleRaw = String(formData.get("scrambleConfig") ?? "");
    const { parseScrambleConfig } = await import("./scramble");
    scrambleConfigJson = JSON.stringify(parseScrambleConfig(scrambleRaw));
    scoringMode = "GROSS";
  }

  if (!courseName) throw new Error("Course name required");
  if (!scheduledAtRaw) throw new Error("Tee time required");

  {
    const { COURSE_PRESETS } = await import("./courses");
    const matched = COURSE_PRESETS.some(
      (p) => p.name.toLowerCase() === courseName.toLowerCase(),
    );
    if (!matched) {
      throw new Error(
        "Course not in catalog. Pick from the list, or reach out to support to add it.",
      );
    }
  }

  const names = formData.getAll("playerName").map((v) => String(v).trim());
  const hcps = formData.getAll("playerHandicap").map((v) => Number(v));
  const explicitUserIds = formData
    .getAll("playerUserId")
    .map((v) => String(v).trim());
  const teamsRaw = formData.getAll("playerTeam").map((v) => Number(v));

  const drafts: (PlayerDraft & { team: 0 | 1 })[] = names
    .map((name, i) => ({
      displayName: name,
      handicap: hcps[i],
      explicitUserId: explicitUserIds[i] || null,
      team: (teamsRaw[i] === 1 ? 1 : 0) as 0 | 1,
    }))
    .filter((p) => p.displayName.length > 0);

  if (drafts.length < 1) throw new Error("Need at least one player");
  if (drafts.some((p) => Number.isNaN(p.handicap)))
    throw new Error("Handicaps must be numbers");

  // Same dedupe as createMatchAction -- one linked Sticks account
  // per round.
  const linkedSet = new Set<string>();
  for (const d of drafts) {
    if (!d.explicitUserId) continue;
    if (linkedSet.has(d.explicitUserId)) {
      throw new Error(
        "Same player is in this round twice. Each linked account can only fill one slot.",
      );
    }
    linkedSet.add(d.explicitUserId);
  }

  if (format === "SCRAMBLE") {
    if (drafts.length < 2) throw new Error("Teams format needs at least 2 players");
    const aCount = drafts.filter((d) => d.team === 0).length;
    const bCount = drafts.filter((d) => d.team === 1).length;
    if (aCount === 0 || bCount === 0) {
      throw new Error("Each team needs at least one player");
    }
  }

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
  if (!parData) {
    const masterCourse = await prisma.course.findUnique({
      where: { name: courseName },
      select: { parData: true },
    });
    if (masterCourse?.parData) {
      try {
        const parsed = JSON.parse(masterCourse.parData);
        if (
          Array.isArray(parsed) &&
          parsed.length === holes &&
          parsed.every((p) => Number.isFinite(p) && p >= 3 && p <= 6)
        ) {
          parData = JSON.stringify(parsed.map((p) => Math.round(p)));
        }
      } catch {
        // ignore
      }
    }
  }
  if (!parData) parData = JSON.stringify(defaultPars(holes));

  const sideGameRaw = formData.getAll("sideGame").map((v) => String(v));
  const sideGameKinds = Array.from(
    new Set(
      sideGameRaw
        .filter(isSideGameKind)
        .filter((k) => !(k === "NASSAU" && holes !== 18)),
    ),
  );

  const groupIdRaw = String(formData.get("groupId") ?? "").trim();
  let groupId: string | null = null;
  if (groupIdRaw && groupIdRaw !== "public") {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: groupIdRaw, userId: user.id } },
    });
    if (membership) groupId = groupIdRaw;
  }

  // Resolve userIds per seat (same priority as create: explicit pick wins,
  // else username == displayName).
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
  const resolveUserId = (d: (typeof drafts)[number]): string | null => {
    const explicit = d.explicitUserId ? userById.get(d.explicitUserId) : undefined;
    const byName = userByName.get(d.displayName.toLowerCase());
    return (explicit ?? byName)?.id ?? null;
  };

  // ---- Update match scalars ----
  await prisma.match.update({
    where: { id: matchId },
    data: {
      courseName,
      scheduledAt: new Date(scheduledAtRaw),
      holes,
      startingHole,
      notes,
      parData,
      scoringMode,
      format,
      scrambleConfig: scrambleConfigJson,
      groupId,
    },
  });

  // ---- Reconcile players by seat ----
  // Surviving seats are updated in place (id preserved); new seats are
  // created; trailing removed seats are deleted (cascades their wagers,
  // odds snapshots, and any side-game events).
  const bySeat = new Map(existing.players.map((p) => [p.seat, p]));
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const team = format === "SCRAMBLE" ? d.team : null;
    const userId = resolveUserId(d);
    const current = bySeat.get(i);
    if (current) {
      await prisma.matchPlayer.update({
        where: { id: current.id },
        data: { displayName: d.displayName, handicap: d.handicap, userId, team },
      });
    } else {
      await prisma.matchPlayer.create({
        data: {
          matchId,
          seat: i,
          displayName: d.displayName,
          handicap: d.handicap,
          userId,
          team,
        },
      });
    }
  }
  for (const p of existing.players) {
    if (p.seat >= drafts.length) {
      await prisma.matchPlayer.delete({ where: { id: p.id } });
    }
  }

  // Fresh seat -> id map for side-game configs.
  const players = await prisma.matchPlayer.findMany({
    where: { matchId },
    orderBy: { seat: "asc" },
  });

  // ---- Reconcile side games ----
  // Drop de-selected games (cascades their events), ensure selected ones
  // exist. Configs for the special games are rebuilt from the form below.
  for (const sg of existing.sideGames) {
    if (!sideGameKinds.includes(sg.kind as never)) {
      await prisma.sideGame.delete({ where: { id: sg.id } });
    }
  }
  for (const kind of sideGameKinds) {
    await prisma.sideGame.upsert({
      where: { matchId_kind: { matchId, kind } },
      update: {},
      create: { matchId, kind },
    });
  }

  if (sideGameKinds.includes("TEAM_VS_TEAM")) {
    const {
      TEAM_VS_TEAM_RULES,
      stringifyTeamVsTeamConfig,
      parseTeamVsTeamConfig,
    } = await import("./sideGames");
    type TvtRule = (typeof TEAM_VS_TEAM_RULES)[number];
    const teamPlayers: Record<0 | 1, string[]> = { 0: [], 1: [] };
    for (let i = 0; i < players.length && i < drafts.length; i++) {
      teamPlayers[drafts[i].team].push(players[i].id);
    }
    if (teamPlayers[0].length > 0 && teamPlayers[1].length > 0) {
      const rawTvt = String(formData.get("tvtConfig") ?? "");
      let parsedRules: { rule: TvtRule; stake?: number; vegas?: unknown }[] = [];
      if (rawTvt) {
        const parsed = parseTeamVsTeamConfig(
          JSON.stringify({ teams: teamPlayers, ...JSON.parse(rawTvt) }),
        );
        if (parsed && parsed.rules.length > 0) parsedRules = parsed.rules;
      }
      if (parsedRules.length === 0) parsedRules = [{ rule: "BEST_BALL" }];
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId, kind: "TEAM_VS_TEAM" } },
        data: {
          config: stringifyTeamVsTeamConfig({
            teams: teamPlayers,
            rules: parsedRules as never,
          }),
        },
      });
    }
  }

  if (sideGameKinds.includes("MATCH")) {
    const raw = String(formData.get("matchConfig") ?? "");
    const { stringifyMatchConfig } = await import("./sideGames");
    let config: string | null = null;
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        const strokesMode: "AUTO" | "MANUAL" =
          obj?.strokesMode === "MANUAL" ? "MANUAL" : "AUTO";
        const manualStrokes: Record<string, number> = {};
        if (strokesMode === "MANUAL" && Array.isArray(obj?.manualStrokesByIndex)) {
          for (
            let i = 0;
            i < players.length && i < obj.manualStrokesByIndex.length;
            i++
          ) {
            const v = obj.manualStrokesByIndex[i];
            if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
              manualStrokes[players[i].id] = Math.floor(v);
            }
          }
        }
        const autoPress = obj?.autoPress === true;
        const rawThreshold = Number(obj?.autoPressThreshold);
        const autoPressThreshold =
          autoPress && Number.isFinite(rawThreshold) && rawThreshold >= 1
            ? Math.floor(rawThreshold)
            : undefined;
        const stakeNum = Number(obj?.stake);
        const stake =
          Number.isFinite(stakeNum) && stakeNum > 0 ? stakeNum : undefined;
        config = stringifyMatchConfig({
          strokesMode,
          manualStrokes,
          autoPress,
          ...(autoPressThreshold ? { autoPressThreshold } : {}),
          ...(stake ? { stake } : {}),
        });
      } catch {
        config = null;
      }
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "MATCH" } },
      data: { config },
    });
  }

  if (sideGameKinds.includes("SIXES")) {
    const raw = String(formData.get("sixesConfig") ?? "");
    const { stringifySixesConfig } = await import("./sideGames");
    let config: string | null = null;
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        const stakeNum = Number(obj?.stake);
        const stake =
          Number.isFinite(stakeNum) && stakeNum > 0 ? stakeNum : undefined;
        if (stake) config = stringifySixesConfig({ stake });
      } catch {
        config = null;
      }
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "SIXES" } },
      data: { config },
    });
  }

  if (sideGameKinds.includes("TARGETS")) {
    const raw = String(formData.get("targetsConfig") ?? "");
    const { parseTargetsConfig, stringifyTargetsConfig } = await import(
      "./sideGames"
    );
    let config: string | null = null;
    if (raw) {
      const parsed = parseTargetsConfig(raw);
      if (parsed && parsed.target > 0) config = stringifyTargetsConfig(parsed);
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "TARGETS" } },
      data: { config },
    });
  }

  // Skins + Wolf push-rule persistence on edit, same shape as the
  // create flow above.
  if (sideGameKinds.includes("SKINS")) {
    const raw = String(formData.get("skinsConfig") ?? "");
    const { parseSkinsConfig, stringifySkinsConfig } = await import(
      "./sideGames"
    );
    let config: string | null = null;
    if (raw) {
      const parsed = parseSkinsConfig(raw);
      config = stringifySkinsConfig(parsed);
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "SKINS" } },
      data: { config },
    });
  }
  if (sideGameKinds.includes("WOLF")) {
    const raw = String(formData.get("wolfConfig") ?? "");
    const { parseWolfConfig, stringifyWolfConfig } = await import(
      "./sideGames"
    );
    let config: string | null = null;
    if (raw) {
      const parsed = parseWolfConfig(raw);
      config = stringifyWolfConfig(parsed);
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "WOLF" } },
      data: { config },
    });
  }
  if (sideGameKinds.includes("STABLEFORD")) {
    const raw = String(formData.get("stablefordConfig") ?? "");
    const { parseStablefordConfig, stringifyStablefordConfig } = await import(
      "./sideGames"
    );
    const config = raw
      ? stringifyStablefordConfig(parseStablefordConfig(raw))
      : null;
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "STABLEFORD" } },
      data: { config },
    });
  }
  if (sideGameKinds.includes("BBB")) {
    const raw = String(formData.get("bbbConfig") ?? "");
    const { parseBbbConfig, stringifyBbbConfig } = await import("./sideGames");
    const config = raw ? stringifyBbbConfig(parseBbbConfig(raw)) : null;
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "BBB" } },
      data: { config },
    });
  }
  if (sideGameKinds.includes("SNAKE")) {
    const raw = String(formData.get("snakeConfig") ?? "");
    const { parseSnakeConfig, stringifySnakeConfig } = await import(
      "./sideGames"
    );
    const config = raw ? stringifySnakeConfig(parseSnakeConfig(raw)) : null;
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "SNAKE" } },
      data: { config },
    });
  }

  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
  redirect(`/matches/${matchId}`);
}

// Slim side-games-only editor. Lets the creator add / remove / re-
// configure side games for matches that are UPCOMING or IN_PROGRESS,
// without exposing the destructive course/players/format fields the
// full editMatchAction would let through. Side game scores recompute
// from existing strokes, so changing them mid-round is safe.
export async function editMatchSideGamesAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId") ?? "").trim();
  if (!matchId) throw new Error("Match id required");

  const existing = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      players: { orderBy: { seat: "asc" } },
      sideGames: true,
    },
  });
  if (!existing) throw new Error("Match not found");
  if (existing.createdById !== user.id) throw new Error("Not your match");
  if (existing.status === "COMPLETED") {
    throw new Error("Match is final -- side games can't be edited");
  }

  const sideGameRaw = formData.getAll("sideGame").map((v) => String(v));
  const sideGameKinds: SideGameKind[] = Array.from(
    new Set(
      sideGameRaw
        .filter(isSideGameKind)
        .filter((k) => !(k === "NASSAU" && existing.holes !== 18)),
    ),
  );

  // SCRAMBLE matches lock TVT to whatever the original config was --
  // the slim editor hides the TVT toggle in scramble (teams live on
  // the player rows in the full editor). Force the existing row to
  // survive so saving the slim editor doesn't strip it.
  if (existing.format === "SCRAMBLE") {
    const hasTvtRow = existing.sideGames.some(
      (sg) => sg.kind === "TEAM_VS_TEAM",
    );
    if (hasTvtRow && !sideGameKinds.includes("TEAM_VS_TEAM")) {
      sideGameKinds.push("TEAM_VS_TEAM");
    }
  }

  // Drop de-selected games (cascades their events), ensure selected ones exist.
  for (const sg of existing.sideGames) {
    if (!sideGameKinds.includes(sg.kind as never)) {
      await prisma.sideGame.delete({ where: { id: sg.id } });
    }
  }
  for (const kind of sideGameKinds) {
    await prisma.sideGame.upsert({
      where: { matchId_kind: { matchId, kind } },
      update: {},
      create: { matchId, kind },
    });
  }

  if (sideGameKinds.includes("SKINS")) {
    const raw = String(formData.get("skinsConfig") ?? "");
    const { parseSkinsConfig, stringifySkinsConfig } = await import(
      "./sideGames"
    );
    let config: string | null = null;
    if (raw) {
      const parsed = parseSkinsConfig(raw);
      config = stringifySkinsConfig(parsed);
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "SKINS" } },
      data: { config },
    });
  }
  if (sideGameKinds.includes("WOLF")) {
    const raw = String(formData.get("wolfConfig") ?? "");
    const { parseWolfConfig, stringifyWolfConfig } = await import(
      "./sideGames"
    );
    let config: string | null = null;
    if (raw) {
      const parsed = parseWolfConfig(raw);
      config = stringifyWolfConfig(parsed);
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "WOLF" } },
      data: { config },
    });
  }
  if (sideGameKinds.includes("TARGETS")) {
    const raw = String(formData.get("targetsConfig") ?? "");
    const { parseTargetsConfig, stringifyTargetsConfig } = await import(
      "./sideGames"
    );
    let config: string | null = null;
    if (raw) {
      const parsed = parseTargetsConfig(raw);
      if (parsed && parsed.target > 0) config = stringifyTargetsConfig(parsed);
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "TARGETS" } },
      data: { config },
    });
  }
  if (sideGameKinds.includes("SIXES")) {
    const raw = String(formData.get("sixesConfig") ?? "");
    const { stringifySixesConfig } = await import("./sideGames");
    let config: string | null = null;
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        const stakeNum = Number(obj?.stake);
        const stake =
          Number.isFinite(stakeNum) && stakeNum > 0 ? stakeNum : undefined;
        if (stake) config = stringifySixesConfig({ stake });
      } catch {
        config = null;
      }
    }
    await prisma.sideGame.update({
      where: { matchId_kind: { matchId, kind: "SIXES" } },
      data: { config },
    });
  }

  // TEAM_VS_TEAM: only the INDIVIDUAL-format flow drives this from the
  // slim editor. The form posts a tvtConfig (rules) + per-seat
  // playerId/playerTeam pairs; we rebuild the full teams config from
  // those. SCRAMBLE matches leave the original config alone.
  if (
    sideGameKinds.includes("TEAM_VS_TEAM") &&
    existing.format !== "SCRAMBLE"
  ) {
    const {
      TEAM_VS_TEAM_RULES,
      stringifyTeamVsTeamConfig,
      parseTeamVsTeamConfig,
    } = await import("./sideGames");
    type TvtRule = (typeof TEAM_VS_TEAM_RULES)[number];
    const playerIds = formData.getAll("playerId").map((v) => String(v));
    const playerTeams = formData
      .getAll("playerTeam")
      .map((v) => (Number(v) === 1 ? 1 : 0) as 0 | 1);
    const teams: { 0: string[]; 1: string[] } = { 0: [], 1: [] };
    for (let i = 0; i < playerIds.length; i++) {
      const pid = playerIds[i];
      // Only seats that survive on the match
      if (existing.players.some((p) => p.id === pid)) {
        teams[playerTeams[i] ?? 0].push(pid);
      }
    }
    if (teams[0].length > 0 && teams[1].length > 0) {
      const rawTvt = String(formData.get("tvtConfig") ?? "");
      let parsedRules: { rule: TvtRule; stake?: number; vegas?: unknown }[] = [];
      if (rawTvt) {
        const parsed = parseTeamVsTeamConfig(
          JSON.stringify({ teams, ...JSON.parse(rawTvt) }),
        );
        if (parsed && parsed.rules.length > 0) parsedRules = parsed.rules;
      }
      if (parsedRules.length === 0) parsedRules = [{ rule: "BEST_BALL" }];
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId, kind: "TEAM_VS_TEAM" } },
        data: {
          config: stringifyTeamVsTeamConfig({
            teams,
            rules: parsedRules as never,
          }),
        },
      });
    }
  }
  // Stableford / BBB / Snake stakes — same inline-config pattern as the
  // create + full-edit flows.
  if (sideGameKinds.includes("STABLEFORD")) {
    const raw = String(formData.get("stablefordConfig") ?? "");
    if (raw) {
      const { parseStablefordConfig, stringifyStablefordConfig } = await import(
        "./sideGames"
      );
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId, kind: "STABLEFORD" } },
        data: { config: stringifyStablefordConfig(parseStablefordConfig(raw)) },
      });
    }
  }
  if (sideGameKinds.includes("BBB")) {
    const raw = String(formData.get("bbbConfig") ?? "");
    if (raw) {
      const { parseBbbConfig, stringifyBbbConfig } = await import(
        "./sideGames"
      );
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId, kind: "BBB" } },
        data: { config: stringifyBbbConfig(parseBbbConfig(raw)) },
      });
    }
  }
  if (sideGameKinds.includes("SNAKE")) {
    const raw = String(formData.get("snakeConfig") ?? "");
    if (raw) {
      const { parseSnakeConfig, stringifySnakeConfig } = await import(
        "./sideGames"
      );
      await prisma.sideGame.update({
        where: { matchId_kind: { matchId, kind: "SNAKE" } },
        data: { config: stringifySnakeConfig(parseSnakeConfig(raw)) },
      });
    }
  }

  await recordOddsSnapshot(matchId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/");
  redirect(`/matches/${matchId}`);
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
  const completed = await prisma.match.update({
    where: { id: matchId },
    data: { status: "COMPLETED", completedAt: new Date() },
    select: { tournamentId: true },
  });
  await recordOddsSnapshot(matchId);
  // Snapshot per-game winners so leaderboard queries can skip the engine
  // for historical matches.
  await computeAndPersistMatchWinners(matchId);

  // Tournament auto-completion. A round is "fully complete" when every
  // foursome (match) in that round is COMPLETED. Once the count of
  // fully-complete rounds reaches roundsPlanned, the tournament flips
  // to COMPLETED. This handles the multi-foursome model correctly: a
  // round with 4 foursomes only "counts" once everyone has signed off.
  if (completed.tournamentId) {
    // Shared with the auto-completion sweep (src/lib/autoComplete.ts).
    await rollupTournamentCompletion(completed.tournamentId);
    revalidatePath(`/tournaments/${completed.tournamentId}`);
  }

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
  // Share-my-round: milestone emails (front 9 / finish) ride the same
  // score-write path. Errors must never break score logging.
  await checkRoundShares(matchId).catch(() => {});
  revalidatePath(`/matches/${matchId}`);
  // The home feed's LIVE card reads the same per-hole score data, so
  // it needs to refresh too -- otherwise a score logged on the match
  // page leaves the home card stale until the user navigates here.
  revalidatePath("/");
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

// Save the current per-match pars as the master pars for the course
// itself. Future matches on this course inherit them automatically
// when no per-match override is sent. Creator-only so a random viewer
// can't rewrite course defaults.
export async function saveCourseParsAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId"));
  const parsRaw = formData.getAll("par").map((v) => Number(v));
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { createdById: true, courseName: true, holes: true },
  });
  if (!match) throw new Error("Match not found");
  if (match.createdById !== user.id) throw new Error("Not your match");
  if (parsRaw.length !== match.holes)
    throw new Error(`Need ${match.holes} pars, got ${parsRaw.length}`);
  if (parsRaw.some((p) => !Number.isFinite(p) || p < 3 || p > 6))
    throw new Error("Pars must be 3, 4, 5, or 6");

  await prisma.course.upsert({
    where: { name: match.courseName },
    create: {
      name: match.courseName,
      parData: JSON.stringify(parsRaw),
    },
    update: { parData: JSON.stringify(parsRaw) },
  });
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
  const matchEvt = isMatchEventKind(kind);
  if (!bbb && !snake && !wolf && !matchEvt)
    throw new Error("Unsupported event kind");

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

  await writeSideGameEvent({ sideGameId, hole, kind, matchPlayerId });
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
// Set a hole's tee from the caller's GPS position. Returns a result
// object rather than throwing on plausibility failures so the on-course
// UI can surface the reason inline ("you're 90y short of the scorecard
// distance") instead of crashing the transition.
export async function markTeeAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = await requireUser();
  const courseName = String(formData.get("courseName") ?? "").trim();
  const hole = Number(formData.get("hole"));
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  // Optional GPS accuracy (yards). Provided by the on-course crowdfix
  // flow; absent from other callers.
  const accuracyRaw = formData.get("accuracyYd");
  const accuracyYd = accuracyRaw == null ? null : Number(accuracyRaw);
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
  if (accuracyYd != null && Number.isFinite(accuracyYd) && accuracyYd > 35) {
    return {
      ok: false,
      reason: `GPS accuracy is ±${Math.round(accuracyYd)}y right now — wait for a tighter lock and try again.`,
    };
  }
  const course = await findOrCreateCourseByName(courseName);
  const existing = await prisma.courseHole.findUnique({
    where: { courseId_hole: { courseId: course.id, hole } },
  });
  // Plausibility: when the hole has a mapped green and a scorecard
  // distance, the new tee must be consistent with both -- this is what
  // makes crowd-set tees safe. Tolerance max(30y, 15%) absorbs GPS
  // noise and tee-box-vs-plate differences while rejecting taps from
  // the cart path, the fairway, or the wrong hole.
  if (
    existing?.greenLat != null &&
    existing?.greenLng != null &&
    existing?.distanceYds != null &&
    existing.distanceYds > 0
  ) {
    const measured = Math.round(
      distanceYards(
        { lat, lng },
        { lat: existing.greenLat, lng: existing.greenLng },
      ),
    );
    const published = existing.distanceYds;
    const tolerance = Math.max(30, published * 0.15);
    if (Math.abs(measured - published) > tolerance) {
      return {
        ok: false,
        reason: `From here it's ${measured}y to the green — the scorecard says ${published}y. Stand on the tee box and try again.`,
      };
    }
  }
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
  return { ok: true };
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

// Save the user's USGA GHIN number. Just storage -- we don't have GHIN API
// access so the value isn't validated against the official directory.
// Stored as digits only (we strip whitespace, dashes, etc).
export async function updateGhinNumberAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("ghinNumber") ?? "").trim();
  const cleaned = raw.replace(/[^\d]/g, "");
  if (cleaned && (cleaned.length < 6 || cleaned.length > 10)) {
    throw new Error("GHIN number should be 6-10 digits");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { ghinNumber: cleaned || null },
  });
  revalidatePath("/settings");
  revalidatePath("/stats");
}

// Update the user's display name. Empty clears it -- the rest of the
// app already falls back to `username` whenever displayName is null
// (match cards, tournament roster, etc.), so an empty field reads as
// "use my @handle".
export async function updateDisplayNameAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("displayName") ?? "").trim();
  if (raw.length > 40) {
    throw new Error("Display name is capped at 40 characters");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { displayName: raw || null },
  });
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/stats");
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

// Delete used from a list (e.g. /stats round list) where we want to stay
// on the page instead of redirecting home. Same authorization rules.
export async function deleteMatchInPlaceAction(matchId: string) {
  const user = await requireUser();
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return;
  if (match.createdById !== user.id) throw new Error("Not your match");
  await prisma.match.delete({ where: { id: matchId } });
  revalidatePath("/stats");
  revalidatePath("/");
}

// ---- Admin-only actions ----

// Admin: save a tee or green-center coordinate for a hole at a course.
// Bypasses the per-user "did you contribute it" attribution -- this is
// curator-grade data.
export async function adminSaveHoleGeoAction(formData: FormData) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const courseName = String(formData.get("courseName") ?? "").trim();
  const hole = Number(formData.get("hole"));
  const kind = String(formData.get("kind") ?? "");
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
  const data: Record<string, number> = {};
  if (kind === "tee") {
    data.teeLat = lat;
    data.teeLng = lng;
  } else if (kind === "green" || kind === "green-center") {
    data.greenLat = lat;
    data.greenLng = lng;
  } else if (kind === "green-front") {
    data.greenFrontLat = lat;
    data.greenFrontLng = lng;
  } else if (kind === "green-back") {
    data.greenBackLat = lat;
    data.greenBackLng = lng;
  } else {
    throw new Error("Unknown pin kind");
  }
  const existing = await prisma.courseHole.findUnique({
    where: { courseId_hole: { courseId: course.id, hole } },
  });
  if (existing) {
    await prisma.courseHole.update({
      where: { id: existing.id },
      data: { ...data, source: "admin" },
    });
  } else {
    await prisma.courseHole.create({
      data: {
        courseId: course.id,
        hole,
        contributedById: user.id,
        source: "admin",
        ...data,
      },
    });
  }
  revalidatePath(`/admin/courses/${encodeURIComponent(courseName)}`);
}

// Admin: clear a pin (tee or green) for a hole. Sets the relevant
// columns back to null.
export async function adminClearHoleGeoAction(formData: FormData) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const courseName = String(formData.get("courseName") ?? "").trim();
  const hole = Number(formData.get("hole"));
  const kind = String(formData.get("kind") ?? "");
  if (!courseName) throw new Error("Course name required");
  const course = await prisma.course.findUnique({ where: { name: courseName } });
  if (!course) return;
  const data: Record<string, null> = {};
  if (kind === "tee") {
    data.teeLat = null;
    data.teeLng = null;
  } else if (kind === "green" || kind === "green-center") {
    data.greenLat = null;
    data.greenLng = null;
  } else if (kind === "green-front") {
    data.greenFrontLat = null;
    data.greenFrontLng = null;
  } else if (kind === "green-back") {
    data.greenBackLat = null;
    data.greenBackLng = null;
  } else {
    throw new Error("Unknown pin kind");
  }
  await prisma.courseHole
    .update({
      where: { courseId_hole: { courseId: course.id, hole } },
      data,
    })
    .catch(() => {
      // Row didn't exist -- nothing to clear.
    });
  revalidatePath(`/admin/courses/${encodeURIComponent(courseName)}`);
}

// Admin: force-delete a match regardless of who created it. For
// cleaning up sloppy / abandoned / duplicate matches.
export async function adminDeleteMatchAction(formData: FormData) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const matchId = String(formData.get("matchId") ?? "").trim();
  if (!matchId) throw new Error("Match id required");
  await prisma.match.delete({ where: { id: matchId } }).catch(() => {
    // Already gone -- ignore.
  });
  revalidatePath("/admin/matches");
  revalidatePath("/");
}

// Admin: set a match's status, bypassing the creator-only check. Also
// stamps startedAt / completedAt so the timeline stays consistent.
export async function adminSetMatchStatusAction(formData: FormData) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const matchId = String(formData.get("matchId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!matchId) throw new Error("Match id required");
  const ALLOWED = ["UPCOMING", "IN_PROGRESS", "COMPLETED"] as const;
  if (!ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    throw new Error("Invalid status");
  }
  const data: {
    status: string;
    startedAt?: Date | null;
    completedAt?: Date | null;
  } = { status };
  // Fill / clear timestamps so they match the new status. We only set
  // missing ones; never overwrite an existing startedAt.
  const existing = await prisma.match.findUnique({
    where: { id: matchId },
    select: { startedAt: true, completedAt: true },
  });
  if (!existing) throw new Error("Match not found");
  if (status === "UPCOMING") {
    data.startedAt = null;
    data.completedAt = null;
  } else if (status === "IN_PROGRESS") {
    if (!existing.startedAt) data.startedAt = new Date();
    data.completedAt = null;
  } else if (status === "COMPLETED") {
    if (!existing.startedAt) data.startedAt = new Date();
    if (!existing.completedAt) data.completedAt = new Date();
  }
  await prisma.match.update({ where: { id: matchId }, data });
  revalidatePath("/admin/matches");
  revalidatePath(`/matches/${matchId}`);
}

// Admin: set the course's center coords (used as the initial map view
// when there are no holes mapped yet).
export async function adminSetCourseCenterAction(formData: FormData) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const courseName = String(formData.get("courseName") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  if (!courseName) throw new Error("Course name required");
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new Error("Invalid coordinates");
  }
  const course = await findOrCreateCourseByName(courseName);
  await prisma.course.update({
    where: { id: course.id },
    data: { centerLat: lat, centerLng: lng },
  });
  revalidatePath(`/admin/courses/${encodeURIComponent(courseName)}`);
}

// Admin: ping GolfBert to confirm credentials work. Returns the raw
// status response so the UI can show it. Throws on auth/network err.
export async function adminGolfBertPingAction() {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const gb = await import("./golfbert");
  return await gb.ping();
}

// Admin: look up a single GolfBert course by id WITHOUT importing.
// Used by single-course subscribers to discover what their licensed
// course is (the API will 403 every id except theirs).
export async function adminGolfBertDescribeAction(courseId: number) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  if (!Number.isFinite(courseId) || courseId <= 0) {
    throw new Error("Valid GolfBert course id required");
  }
  const gb = await import("./golfbert");
  const c = await gb.getCourse(courseId);
  return {
    id: c.id,
    name: c.name,
    city: c.address?.city ?? null,
    state: c.address?.state ?? null,
  };
}

// Admin: search GolfBert by name. Returns a thin list the UI can
// render so the admin can pick the right course id.
export async function adminGolfBertSearchAction(name: string) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  if (!name.trim()) return [] as Array<{
    id: number;
    name: string;
    city?: string | null;
    state?: string | null;
  }>;
  const gb = await import("./golfbert");
  const resp = await gb.searchCourses({ name: name.trim(), limit: 25 });
  return (resp.resources ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.address?.city ?? null,
    state: c.address?.state ?? null,
  }));
}

// Admin: import all hole geometry for a course from GolfBert into our
// Course + CourseHole tables. `courseName` is the Sticks-side name to
// bind the import to -- usually the existing one selected in the
// editor, so future matches at that name pick up the geometry.
export async function adminImportFromGolfBertAction(formData: FormData) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const courseName = String(formData.get("courseName") ?? "").trim();
  const golfbertId = Number(formData.get("golfbertId"));
  if (!courseName) throw new Error("Course name required");
  if (!Number.isFinite(golfbertId) || golfbertId <= 0) {
    throw new Error("Valid GolfBert course id required");
  }
  const gb = await import("./golfbert");
  const imported = await gb.importCourseFromGolfBert(golfbertId);

  const course = await findOrCreateCourseByName(courseName);
  // Update course-level center coords + par data (par totalled from
  // teeboxes per hole). osmFetchedAt stays untouched -- this is a
  // separate source.
  const pars = imported.holes.map((h) => h.par ?? 4);
  await prisma.course.update({
    where: { id: course.id },
    data: {
      centerLat: imported.centerLat ?? course.centerLat ?? undefined,
      centerLng: imported.centerLng ?? course.centerLng ?? undefined,
      parData: JSON.stringify(pars),
    },
  });

  // Wipe existing hazards for this course before re-creating from
  // GolfBert. Each re-import was duplicating rows: after five imports
  // a hole with 4 sand traps had 20 SAND chips. Idempotency wins over
  // preserving hand-marked hazards here -- v1 has no user-marked
  // hazards yet, and a `source` column would let us scope this later.
  const wipeRes = await prisma.courseHazard.deleteMany({
    where: { courseId: course.id },
  });

  // Upsert each hole. We always overwrite when GolfBert has the
  // value -- this is curated data; preserve admin-source rows only
  // if GolfBert returned null for that field.
  let holesWritten = 0;
  let hazardsWritten = 0;
  for (const h of imported.holes) {
    await prisma.courseHole.upsert({
      where: { courseId_hole: { courseId: course.id, hole: h.number } },
      update: {
        teeLat: h.teeLat,
        teeLng: h.teeLng,
        greenLat: h.greenLat,
        greenLng: h.greenLng,
        greenPolygonJson: h.greenPolygon
          ? JSON.stringify(h.greenPolygon)
          : null,
        fairwayPolygonJson: h.fairwayPolygon
          ? JSON.stringify(h.fairwayPolygon)
          : null,
        distanceYds: h.yardage,
        source: "golfbert",
      },
      create: {
        courseId: course.id,
        hole: h.number,
        teeLat: h.teeLat,
        teeLng: h.teeLng,
        greenLat: h.greenLat,
        greenLng: h.greenLng,
        greenPolygonJson: h.greenPolygon
          ? JSON.stringify(h.greenPolygon)
          : null,
        fairwayPolygonJson: h.fairwayPolygon
          ? JSON.stringify(h.fairwayPolygon)
          : null,
        distanceYds: h.yardage,
        source: "golfbert",
      },
    });
    holesWritten++;

    // Hazards: wipe previous golfbert-sourced hazards for this hole,
    // then insert the fresh batch. Course-wide we'd want a source
    // column on CourseHazard to scope this -- without it, we use
    // contributedById==null AND createdAt match windowing as a proxy.
    // Simpler v1: leave user-marked hazards in place; only add new
    // ones. Idempotency is acceptable here -- duplicates are visual
    // noise but not destructive.
    for (const hz of h.hazards) {
      await prisma.courseHazard.create({
        data: {
          courseId: course.id,
          hole: h.number,
          kind: hz.kind,
          label: hz.label ?? null,
          lat: hz.lat,
          lng: hz.lng,
          contributedById: user.id,
        },
      });
      hazardsWritten++;
    }
  }

  // Propagate the fresh par set to any matches at this course that
  // still hold the default [4,4,3,5,...] layout (or anything else).
  // Active rounds in progress are left alone -- a re-import shouldn't
  // change pars mid-round. v1: refresh UPCOMING matches only.
  await prisma.match.updateMany({
    where: { courseName, status: "UPCOMING" },
    data: { parData: JSON.stringify(pars) },
  });

  revalidatePath(`/admin/courses/${encodeURIComponent(courseName)}`);
  return {
    courseName,
    golfbertId,
    holesWritten,
    hazardsWritten,
    hazardsWiped: wipeRes.count,
    par: pars.reduce((a, b) => a + b, 0),
  };
}

// Public (signed-in) helper: given the player's lat/lng, return the
// closest courses we know coordinates for. Used by the new-match
// wizard's "find course near me" autosuggest. Capped at a sensible
// radius so users far from any mapped course don't get nonsense
// suggestions from across the country.
export async function findClosestCoursesAction(input: {
  lat: number;
  lng: number;
  limit?: number;
  maxYards?: number;
}) {
  await requireUser();
  const { lat, lng } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Valid lat/lng required");
  }
  const limit = Math.max(1, Math.min(10, input.limit ?? 5));
  const maxYards = Math.max(1000, input.maxYards ?? 50 * 1760); // 50 miles default

  const { COURSE_PRESETS, COURSE_PRESET_COORDS } = await import("./courses");

  // Gather candidates from both sources. DB rows win on name collision
  // (they have GolfBert / OSM-imported precise coords); presets without
  // a Course row fill the rest of the catalog.
  const rows = await prisma.course.findMany({
    where: { centerLat: { not: null }, centerLng: { not: null } },
    select: { name: true, centerLat: true, centerLng: true },
  });
  const byName = new Map<string, { lat: number; lng: number }>();
  for (const p of COURSE_PRESETS) {
    const c = COURSE_PRESET_COORDS[p.id];
    if (c) byName.set(p.name, { lat: c.lat, lng: c.lng });
  }
  for (const r of rows) {
    byName.set(r.name, {
      lat: r.centerLat as number,
      lng: r.centerLng as number,
    });
  }

  // Haversine, inlined so this action stays self-contained.
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const scored = Array.from(byName.entries())
    .map(([name, c]) => {
      const dLat = toRad(c.lat - lat);
      const dLng = toRad(c.lng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) *
          Math.cos(toRad(c.lat)) *
          Math.sin(dLng / 2) ** 2;
      const meters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return { name, yards: meters * 1.0936133 };
    })
    .filter((c) => c.yards <= maxYards)
    .sort((a, b) => a.yards - b.yards)
    .slice(0, limit)
    .map((c) => ({ name: c.name, yards: Math.round(c.yards) }));
  return scored;
}

// Admin: rename a Course in place. Used to fix mis-labeled records --
// for example when a GolfBert import landed in a course row created
// under the wrong name. Matches are NOT remapped here -- a separate
// pass would need to update Match.courseName rows that referenced the
// old name; v1 callers should rename before any matches exist.
export async function adminRenameCourseAction(formData: FormData) {
  const user = await requireUser();
  const { isUserAdmin } = await import("./admin");
  if (!isUserAdmin(user)) throw new Error("Admin only");
  const oldName = String(formData.get("oldName") ?? "").trim();
  const newName = String(formData.get("newName") ?? "").trim();
  if (!oldName) throw new Error("Existing course name required");
  if (!newName) throw new Error("New course name required");
  if (oldName === newName) throw new Error("New name matches the old name");
  const existing = await prisma.course.findUnique({
    where: { name: newName },
  });
  if (existing) throw new Error(`A course named "${newName}" already exists`);
  await prisma.course.update({
    where: { name: oldName },
    data: { name: newName },
  });
  // Update any matches that referenced the old courseName so future
  // on-course views still find geometry.
  await prisma.match.updateMany({
    where: { courseName: oldName },
    data: { courseName: newName },
  });
  revalidatePath(`/admin/courses/${encodeURIComponent(oldName)}`);
  revalidatePath(`/admin/courses/${encodeURIComponent(newName)}`);
  revalidatePath(`/admin/courses`);
  return { newName };
}

// ─────────────────────────────────────────────────────────────────────
// WebAuthn / passkey actions
// ─────────────────────────────────────────────────────────────────────
// Enroll + sign-in with Face ID / Touch ID / Windows Hello / Android
// fingerprint. All four steps (start register, finish register, start
// auth, finish auth) are colocated here; the per-step crypto lives in
// @simplewebauthn/server. Challenges round-trip through Postgres so a
// pair of start+finish calls can hit different serverless instances.

// We type these RegistrationResponseJSON / AuthenticationResponseJSON
// objects the browser hands us as `unknown` and let the verify*
// helpers parse them. Avoids dragging the heavy simplewebauthn types
// into the action signatures.
export async function startPasskeyRegistrationAction(): Promise<unknown> {
  const user = await requireUser();
  const { generateRegistrationOptions } = await import("@simplewebauthn/server");
  const {
    rpId,
    rpName,
    storeChallenge,
    base64UrlToBytes,
    sweepExpiredChallenges,
  } = await import("./webauthn");
  await sweepExpiredChallenges();

  // Exclude credentials already enrolled on this user so the OS prompt
  // skips "you already added this device."
  const existing = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rpId(),
    userID: base64UrlToBytes(Buffer.from(user.id, "utf-8").toString("base64url")),
    userName: user.username,
    userDisplayName: user.displayName ?? user.username,
    attestationType: "none",
    // Discoverable / resident key so the user can sign in without
    // typing their username later -- Face ID alone is enough.
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: (p.transports ?? "").split(",").filter(Boolean) as never,
    })),
  });

  await storeChallenge(options.challenge, "registration", user.id);
  return options;
}

export async function finishPasskeyRegistrationAction(input: {
  response: unknown;
  deviceName?: string | null;
}): Promise<{ ok: true; deviceName: string } | { error: string }> {
  const user = await requireUser();
  const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
  const {
    rpId,
    expectedOrigin,
    consumeChallenge,
    bytesToBase64Url,
  } = await import("./webauthn");

  const response = input.response as {
    response: { clientDataJSON: string };
  };
  // Extract the challenge from the client data so we can look it up
  // and confirm we issued it.
  let challenge: string | null = null;
  try {
    const cd = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString("utf-8"),
    );
    challenge = typeof cd.challenge === "string" ? cd.challenge : null;
  } catch {
    return { error: "Malformed registration response" };
  }
  if (!challenge) return { error: "Missing challenge" };
  const issued = await consumeChallenge(challenge, "registration");
  if (!issued || issued.userId !== user.id) {
    return { error: "Challenge expired or invalid" };
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpId(),
      requireUserVerification: false,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { error: "Could not verify passkey" };
  }
  const reg = verification.registrationInfo;
  const credential = reg.credential as unknown as {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: string[];
  };

  const deviceName = (input.deviceName ?? "").trim() || "This device";
  await prisma.passkey.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: bytesToBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []).join(",") || null,
      deviceName,
    },
  });
  revalidatePath("/settings");
  return { ok: true, deviceName };
}

export async function startPasskeyAuthenticationAction(): Promise<unknown> {
  const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
  const { rpId, storeChallenge, sweepExpiredChallenges } = await import("./webauthn");
  await sweepExpiredChallenges();
  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    userVerification: "preferred",
    // Empty allowCredentials lets the platform surface every passkey
    // bound to this RP -- the user picks (or auto-selects if there's
    // only one). True passwordless sign-in.
    allowCredentials: [],
  });
  await storeChallenge(options.challenge, "authentication", null);
  return options;
}

export async function finishPasskeyAuthenticationAction(input: {
  response: unknown;
  next?: string;
}): Promise<{ ok: true; next: string } | { error: string }> {
  const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
  const {
    rpId,
    expectedOrigin,
    consumeChallenge,
    base64UrlToBytes,
    bytesToBase64Url,
  } = await import("./webauthn");

  const response = input.response as {
    id: string;
    response: { clientDataJSON: string };
  };
  let challenge: string | null = null;
  try {
    const cd = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString("utf-8"),
    );
    challenge = typeof cd.challenge === "string" ? cd.challenge : null;
  } catch {
    return { error: "Malformed authentication response" };
  }
  if (!challenge) return { error: "Missing challenge" };
  const issued = await consumeChallenge(challenge, "authentication");
  if (!issued) return { error: "Challenge expired or invalid" };

  const stored = await prisma.passkey.findUnique({
    where: { credentialId: response.id },
  });
  if (!stored) return { error: "Unknown passkey" };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(),
      expectedRPID: rpId(),
      requireUserVerification: false,
      credential: {
        id: stored.credentialId,
        publicKey: base64UrlToBytes(stored.publicKey),
        counter: stored.counter,
        transports: (stored.transports ?? "")
          .split(",")
          .filter(Boolean) as never,
      },
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (!verification.verified) return { error: "Verification failed" };

  await prisma.passkey.update({
    where: { id: stored.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });
  // Silence "unused" warning: bytesToBase64Url is exported but not used here.
  void bytesToBase64Url;
  await setSession(stored.userId);
  return { ok: true, next: safeNext(input.next ?? "/") };
}

export async function removePasskeyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const passkeyId = String(formData.get("passkeyId") ?? "");
  if (!passkeyId) return;
  const row = await prisma.passkey.findUnique({ where: { id: passkeyId } });
  if (!row || row.userId !== user.id) return;
  await prisma.passkey.delete({ where: { id: passkeyId } });
  revalidatePath("/settings");
}

export async function listMyPasskeysAction(): Promise<
  Array<{ id: string; deviceName: string | null; createdAt: Date; lastUsedAt: Date | null }>
> {
  const user = await getCurrentUser();
  if (!user) return [];
  return prisma.passkey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
  });
}

// Admin: ping GolfBert + search wrappers above.
export { getCurrentUser };

// ---- Tournament actions -------------------------------------------

// Create a multi-round tournament. Tournaments aren't tied to a group
// any more -- anyone with the invite code can join, which lets a
// creator pull players from across multiple foursomes (Saturday
// scramble with 4 groups of 4) into one cumulative leaderboard.
// The roster starts with just the creator; everyone else joins via
// /tournaments/join with the code.
export async function createTournamentAction(formData: FormData) {
  const me = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const scoringMode = (() => {
    const raw = String(formData.get("scoringMode") ?? "NET");
    return raw === "GROSS" ? "GROSS" : "NET";
  })();
  const roundsPlanned = (() => {
    const raw = parseInt(String(formData.get("roundsPlanned") ?? "2"), 10);
    if (!Number.isFinite(raw)) return 2;
    return Math.max(1, Math.min(12, raw));
  })();
  const scheduledStartAtRaw = String(
    formData.get("scheduledStartAt") ?? "",
  ).trim();
  const scheduledStartAt = scheduledStartAtRaw
    ? new Date(scheduledStartAtRaw)
    : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) throw new Error("Tournament name required");

  // Generate a 6-character invite code; retry on collision (the
  // Tournament.inviteCode column is unique).
  let inviteCode = generateInviteCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    // findFirst rather than findUnique because the column isn't
    // @unique at the schema level (see comment in Tournament model).
    const existing = await prisma.tournament.findFirst({
      where: { inviteCode },
      select: { id: true },
    });
    if (!existing) break;
    inviteCode = generateInviteCode();
  }

  // Creator auto-joins the roster. Everyone else has to enter the
  // code on /tournaments/join.
  const meName = me.displayName ?? me.username;

  const tournament = await prisma.tournament.create({
    data: {
      name,
      inviteCode,
      scoringMode,
      roundsPlanned,
      scheduledStartAt,
      notes,
      createdById: me.id,
      roster: {
        create: [
          {
            displayName: meName,
            userId: me.id,
            handicapAtStart: null,
          },
        ],
      },
    },
  });

  redirect(`/tournaments/${tournament.id}`);
}

// Add the current user to a tournament's roster via invite code.
// Idempotent: rejoining is a no-op. The roster entry stores the
// user's display name + the optional handicap input (Sticks index
// when they have one). Mirrors joinGroupByCodeAction's shape.
export async function joinTournamentAction(formData: FormData) {
  const me = await requireUser();
  const codeRaw = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!codeRaw) throw new Error("Invite code required");
  const handicapRaw = String(formData.get("handicap") ?? "").trim();
  const handicap = handicapRaw ? Number(handicapRaw) : null;
  const handicapAtStart =
    handicap != null && Number.isFinite(handicap) ? handicap : null;

  const tournament = await prisma.tournament.findFirst({
    where: { inviteCode: codeRaw },
    include: { roster: { select: { userId: true, displayName: true } } },
  });
  if (!tournament) throw new Error("No tournament for that code");

  const meName = me.displayName ?? me.username;
  // Already in by userId? -> nothing to do.
  if (tournament.roster.some((r) => r.userId === me.id)) {
    redirect(`/tournaments/${tournament.id}`);
  }
  // Display-name collision (someone joined as a free-typed name
  // matching the user's display name). Append a disambiguator so the
  // unique index doesn't trip.
  let finalName = meName;
  const taken = new Set(
    tournament.roster.map((r) => r.displayName.toLowerCase()),
  );
  if (taken.has(finalName.toLowerCase())) {
    let n = 2;
    while (taken.has(`${finalName} (${n})`.toLowerCase())) n++;
    finalName = `${finalName} (${n})`;
  }
  await prisma.tournamentPlayer.create({
    data: {
      tournamentId: tournament.id,
      displayName: finalName,
      userId: me.id,
      handicapAtStart,
    },
  });

  revalidatePath(`/tournaments/${tournament.id}`);
  redirect(`/tournaments/${tournament.id}`);
}

// Delete a tournament. Creator-only. Child Match rows are NOT deleted:
// the schema relation is onDelete: SetNull on Match.tournamentId, so
// the rounds detach back into standalone matches that still show up on
// the home feed / group page. Roster cascades away with the tournament.
export async function deleteTournamentAction(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get("tournamentId") ?? "");
  if (!id) throw new Error("Missing tournamentId");
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { id: true, createdById: true, groupId: true },
  });
  if (!tournament) return;
  if (tournament.createdById !== me.id) {
    throw new Error("Only the tournament creator can delete it");
  }
  await prisma.tournament.delete({ where: { id } });
  revalidatePath("/");
  if (tournament.groupId) {
    revalidatePath(`/groups/${tournament.groupId}`);
  }
  redirect("/");
}

// Manually mark a tournament COMPLETED. Creator-only. The auto-complete
// in completeMatchAction only fires when every match in every planned
// round is done; for a tournament where the creator only ever ran one
// of three planned rounds, that path never trips. This is the explicit
// "call it" button -- final leaderboard is whatever's been scored so
// far, the tournament drops out of the active section on the home
// page and into the settled section.
export async function completeTournamentAction(formData: FormData) {
  const me = await requireUser();
  const id = String(formData.get("tournamentId") ?? "");
  if (!id) throw new Error("Missing tournamentId");
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { id: true, createdById: true, status: true, groupId: true },
  });
  if (!tournament) return;
  if (tournament.createdById !== me.id) {
    throw new Error("Only the tournament creator can finish it");
  }
  if (tournament.status === "COMPLETED") return;
  await prisma.tournament.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  revalidatePath(`/tournaments/${id}`);
  revalidatePath("/");
  if (tournament.groupId) {
    revalidatePath(`/groups/${tournament.groupId}`);
  }
}
