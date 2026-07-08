// GET  /api/mobile/matches/:id/shares -- the caller's own live share
//   links for this round.
// POST /api/mobile/matches/:id/shares -- create a share link for YOUR
//   OWN round (the caller must be seated). Body:
//   { "includeScores": true, "destAddress"?: "123 Main St",
//     "bufferMin"?: 30 }. Returns the public link. Mirrors the web
//   createRoundShareAction (own-seat-only, destination geocoded at
//   save, buffer clamped 0–180, default milestones FRONT9+FINISH).
// Share shape: { id, token, url, includeScores, destAddress|null,
//   bufferMin }.

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { geocodeAddress } from "@/lib/roundShare";

export const dynamic = "force-dynamic";

const BASE = "https://sticks-golf.vercel.app";

function shape(s: {
  id: string;
  token: string;
  includeScores: boolean;
  destAddress: string | null;
  bufferMin: number;
}) {
  return {
    id: s.id,
    token: s.token,
    url: `${BASE}/r/${s.token}`,
    includeScores: s.includeScores,
    destAddress: s.destAddress,
    bufferMin: s.bufferMin,
  };
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();
  const shares = await prisma.roundShare.findMany({
    where: { matchId: params.id, createdById: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      token: true,
      includeScores: true,
      destAddress: true,
      bufferMin: true,
    },
  });
  return NextResponse.json({ shares: shares.map(shape) });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { id: true, players: { select: { id: true, userId: true } } },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  // Own round only: derive the caller's seat server-side.
  const mySeat = match.players.find((p) => p.userId === user.id);
  if (!mySeat) {
    return NextResponse.json(
      { error: "You can only share a round you're playing in." },
      { status: 403 },
    );
  }

  let body: { includeScores?: unknown; destAddress?: unknown; bufferMin?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const includeScores = body.includeScores !== false; // default true
  const destAddress = String(body.destAddress ?? "").trim();
  const bufferRaw = Number(body.bufferMin ?? 0);
  const bufferMin = Number.isFinite(bufferRaw)
    ? Math.max(0, Math.min(180, Math.round(bufferRaw)))
    : 0;

  let destLat: number | null = null;
  let destLng: number | null = null;
  if (destAddress) {
    const geo = await geocodeAddress(destAddress).catch(() => null);
    if (geo) {
      destLat = geo.lat;
      destLng = geo.lng;
    }
  }

  const created = await prisma.roundShare.create({
    data: {
      matchId: match.id,
      matchPlayerId: mySeat.id,
      createdById: user.id,
      token: randomBytes(16).toString("hex"),
      includeScores,
      milestones: "FRONT9,FINISH",
      destAddress: destAddress || null,
      destLat,
      destLng,
      bufferMin,
    },
    select: {
      id: true,
      token: true,
      includeScores: true,
      destAddress: true,
      bufferMin: true,
    },
  });

  return NextResponse.json({ share: shape(created) });
}
