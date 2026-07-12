// POST /api/mobile/matches/:id/side-game-config
// Set a side game's configuration -- the native equivalent of the web
// config editors. Creator only. Body: { "kind": "WOLF"|"TARGETS"|
// "SKINS"|"MATCH"|"SIXES"|"TEAM_VS_TEAM", "config": { … } }. The config
// object is sanitized through the same parser the web uses and stored on
// the SideGame row. The game must already be enabled (POST /side-games).
//
// Config shapes (all fields optional unless noted):
//   WOLF:    { rotation?: [matchPlayerId…], pushRule?: "ROLLOVER"|"NO_POINTS" }
//   SKINS:   { pushRule?: "CARRYOVER"|"NO_CARRY" }
//   TARGETS: { stat, target (number), ante? }         // stat+target required
//   MATCH:   { strokesMode, manualStrokes?, autoPress?, autoPressThreshold?, stake? }
//   SIXES:   { stake? }
//   STABLEFORD: { points?: { albatross,eagle,birdie,par,bogey,double } }
//   BBB:     { points?: { bingo, bango, bongo } }
//   SNAKE:   { stake?, doubling? }
//   NASSAU:  { autoPress?, autoPressThreshold?, stake? }
//   TEAM_VS_TEAM: { teams: {0:[…],1:[…]}, rules: [{ rule, stake?, vegas? }], teamNames? }
// 200: { ok: true, kind, config }.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import {
  parseWolfConfig,
  stringifyWolfConfig,
  parseSkinsConfig,
  stringifySkinsConfig,
  parseMatchConfig,
  stringifyMatchConfig,
  parseSixesConfig,
  stringifySixesConfig,
  parseTargetsConfig,
  stringifyTargetsConfig,
  parseTeamVsTeamConfig,
  stringifyTeamVsTeamConfig,
  parseStablefordConfig,
  stringifyStablefordConfig,
  parseBbbConfig,
  stringifyBbbConfig,
  parseSnakeConfig,
  stringifySnakeConfig,
  parseNassauConfig,
  stringifyNassauConfig,
} from "@/lib/sideGames";

export const dynamic = "force-dynamic";

// Older native builds (slice 53) sent Wolf's pushRule as "CARRY"/"NO_CARRY"
// instead of the engine's "ROLLOVER"/"NO_POINTS", so the choice silently
// dropped. Map the legacy values here so those clients keep working without
// a rebuild. Newer clients send the correct values and pass through.
function normalizeWolfRaw(config: unknown): string {
  const c =
    config && typeof config === "object"
      ? { ...(config as Record<string, unknown>) }
      : {};
  if (c.pushRule === "CARRY") c.pushRule = "ROLLOVER";
  else if (c.pushRule === "NO_CARRY") c.pushRule = "NO_POINTS";
  return JSON.stringify(c);
}

// Sanitize + re-serialize a config for a given game kind using the same
// parser the web relies on. Returns null when the game has no config or
// the supplied config is invalid.
function sanitizeConfig(kind: string, config: unknown): string | null {
  const raw = JSON.stringify(config ?? {});
  switch (kind) {
    case "WOLF":
      return stringifyWolfConfig(parseWolfConfig(normalizeWolfRaw(config)));
    case "SKINS":
      return stringifySkinsConfig(parseSkinsConfig(raw));
    case "MATCH": {
      const c = parseMatchConfig(raw);
      return c ? stringifyMatchConfig(c) : null;
    }
    case "SIXES": {
      const c = parseSixesConfig(raw);
      return c ? stringifySixesConfig(c) : null;
    }
    case "TARGETS": {
      const c = parseTargetsConfig(raw);
      return c ? stringifyTargetsConfig(c) : null;
    }
    case "STABLEFORD":
      return stringifyStablefordConfig(parseStablefordConfig(raw));
    case "BBB":
      return stringifyBbbConfig(parseBbbConfig(raw));
    case "SNAKE":
      return stringifySnakeConfig(parseSnakeConfig(raw));
    case "NASSAU":
      return stringifyNassauConfig(parseNassauConfig(raw));
    case "TEAM_VS_TEAM": {
      const c = parseTeamVsTeamConfig(raw);
      return c ? stringifyTeamVsTeamConfig(c) : null;
    }
    default:
      return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: { kind?: unknown; config?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const kind = String(body.kind ?? "").trim();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      createdById: true,
      sideGames: { select: { id: true, kind: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  // Config is creator-scoped (mirrors the web's updateWolfConfigAction).
  if (match.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the round's creator can change side-game settings." },
      { status: 403 },
    );
  }
  const sideGame = match.sideGames.find((sg) => sg.kind === kind);
  if (!sideGame) {
    return NextResponse.json(
      { error: `Turn on ${kind || "this game"} for this round first.` },
      { status: 400 },
    );
  }

  const configJson = sanitizeConfig(kind, body.config);
  if (configJson === null) {
    return NextResponse.json(
      { error: "That game has no settings, or the settings were invalid." },
      { status: 400 },
    );
  }

  await prisma.sideGame.update({
    where: { id: sideGame.id },
    data: { config: configJson },
  });

  return NextResponse.json({ ok: true, kind, config: configJson });
}
