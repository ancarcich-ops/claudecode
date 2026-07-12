// GET  /api/mobile/me/profile -- the iOS Settings tab's editable
//      profile: identity, GHIN, the computed Sticks Index (read-only),
//      and the goal index. Avatar is read-only here (photo upload is
//      web-only for now).
// POST /api/mobile/me/profile -- update displayName and/or ghinNumber.
//      Same validation as the web (name <= 40, empty clears; GHIN
//      6-10 digits or empty to clear). Only the keys present in the
//      body are touched.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { computeUserStats } from "@/lib/userStats";

export const dynamic = "force-dynamic";

async function profilePayload(userId: string) {
  const [profile, stats] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        displayName: true,
        ghinNumber: true,
        avatarUrl: true,
        targetIndex: true,
      },
    }),
    computeUserStats(userId),
  ]);
  if (!profile) return null;
  return {
    username: profile.username,
    displayName: profile.displayName,
    ghin: profile.ghinNumber,
    avatarUrl: profile.avatarUrl ?? null,
    targetIndex: profile.targetIndex ?? null,
    // Read-only: the auto-computed index + how many rounds fed it.
    computedIndex: stats?.handicap?.index ?? null,
    indexFromRounds: stats?.handicap?.fromRounds ?? 0,
    totalRounds: stats?.rounds.length ?? 0,
  };
}

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();
  const payload = await profilePayload(user.id);
  if (!payload) return NextResponse.json({ error: "No profile" }, { status: 404 });
  return NextResponse.json({ profile: payload });
}

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: { displayName?: unknown; ghinNumber?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const data: { displayName?: string | null; ghinNumber?: string | null } = {};

  if ("displayName" in body) {
    const raw = String(body.displayName ?? "").trim();
    if (raw.length > 40) {
      return NextResponse.json(
        { error: "Display name is capped at 40 characters" },
        { status: 400 },
      );
    }
    data.displayName = raw || null; // empty clears -> falls back to @username
  }

  if ("ghinNumber" in body) {
    const cleaned = String(body.ghinNumber ?? "").replace(/[^\d]/g, "");
    if (cleaned && (cleaned.length < 6 || cleaned.length > 10)) {
      return NextResponse.json(
        { error: "GHIN number should be 6-10 digits" },
        { status: 400 },
      );
    }
    data.ghinNumber = cleaned || null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.user.update({ where: { id: user.id }, data });
  }

  const payload = await profilePayload(user.id);
  return NextResponse.json({ profile: payload });
}
