// Shared writer for per-hole side-game events (Snake / BBB / Wolf /
// Match press). Extracted from recordSideGameEventAction so the web
// action and the mobile endpoint apply the *exact* same toggle/mutex
// rules and can't drift.

import { prisma } from "./db";
import {
  isBbbEventKind,
  isSnakeEventKind,
  isWolfEventKind,
  isMatchEventKind,
} from "./sideGames";

// The side-game KIND that owns a given EVENT kind (BINGO -> BBB, etc.).
export function gameKindForEventKind(
  kind: string,
): "BBB" | "SNAKE" | "WOLF" | "MATCH" | null {
  if (isBbbEventKind(kind)) return "BBB";
  if (isSnakeEventKind(kind)) return "SNAKE";
  if (isWolfEventKind(kind)) return "WOLF";
  if (isMatchEventKind(kind)) return "MATCH";
  return null;
}

export function isRecordableEventKind(kind: string): boolean {
  return gameKindForEventKind(kind) !== null;
}

/**
 * Apply one event write for a side game, with each game's mutex rules.
 * Mirrors recordSideGameEventAction's body exactly.
 */
export async function writeSideGameEvent(input: {
  sideGameId: string;
  hole: number;
  kind: string;
  matchPlayerId: string | null;
}): Promise<void> {
  const { sideGameId, hole, kind, matchPlayerId } = input;
  const bbb = isBbbEventKind(kind);
  const snake = isSnakeEventKind(kind);
  const wolf = isWolfEventKind(kind);
  const matchEvt = isMatchEventKind(kind);

  if (bbb) {
    // Single-award kinds: replace any existing row for this (game, hole, kind).
    await prisma.sideGameEvent.deleteMany({ where: { sideGameId, hole, kind } });
    if (matchPlayerId) {
      await prisma.sideGameEvent.create({
        data: { sideGameId, hole, kind, matchPlayerId },
      });
    }
  } else if (snake) {
    // Multi-player toggle: each (hole, player) is independent.
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
      await prisma.sideGameEvent.deleteMany({
        where: { sideGameId, hole, kind: { in: ["HOLE_WINNER", "PUSH"] } },
      });
      if (kind === "HOLE_WINNER" && matchPlayerId) {
        await prisma.sideGameEvent.create({
          data: { sideGameId, hole, kind, matchPlayerId },
        });
      } else if (kind === "PUSH" && matchPlayerId) {
        await prisma.sideGameEvent.create({ data: { sideGameId, hole, kind } });
      }
    }
  } else if (matchEvt) {
    // Match PRESS: pair-wide toggle, one event per hole.
    const existing = await prisma.sideGameEvent.findFirst({
      where: { sideGameId, hole, kind },
      select: { id: true },
    });
    if (existing) {
      await prisma.sideGameEvent.delete({ where: { id: existing.id } });
    } else {
      await prisma.sideGameEvent.create({ data: { sideGameId, hole, kind } });
    }
  } else {
    throw new Error("Unsupported event kind");
  }
}
