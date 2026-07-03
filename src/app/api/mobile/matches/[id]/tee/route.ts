// POST /api/mobile/matches/:id/tee
// Auth: Bearer token (creator or seated player).
// Body: { hole: number, lat: number, lng: number, accuracyYd?: number }
// The native FIX TEE crowdfix: sets the hole's tee to the caller's GPS
// position, with the same plausibility gates as the web flow
// (markTeeAction): GPS accuracy <= 35y, and when the hole has a green
// + scorecard distance, the position must sit within max(30y, 15%) of
// the published yardage from the green.
// 200: { ok: true } | { ok: false, reason } (400 for malformed input)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { findOrCreateCourseByName, distanceYards } from "@/lib/course";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: {
    hole?: number;
    lat?: number;
    lng?: number;
    accuracyYd?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const hole = Number(body.hole);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const accuracyYd = body.accuracyYd == null ? null : Number(body.accuracyYd);
  if (!Number.isFinite(hole) || hole < 1 || hole > 36) {
    return NextResponse.json({ error: "Invalid hole number" }, { status: 400 });
  }
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      courseName: true,
      createdById: true,
      players: { select: { userId: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  const isCreator = match.createdById === user.id;
  const isSeated = match.players.some((p) => p.userId === user.id);
  if (!isCreator && !isSeated) {
    return NextResponse.json({ error: "Not your match" }, { status: 403 });
  }

  if (accuracyYd != null && Number.isFinite(accuracyYd) && accuracyYd > 35) {
    return NextResponse.json({
      ok: false,
      reason: `GPS accuracy is ±${Math.round(accuracyYd)}y right now — wait for a tighter lock and try again.`,
    });
  }

  const course = await findOrCreateCourseByName(match.courseName);
  const existing = await prisma.courseHole.findUnique({
    where: { courseId_hole: { courseId: course.id, hole } },
  });
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
      return NextResponse.json({
        ok: false,
        reason: `From here it's ${measured}y to the green — the scorecard says ${published}y. Stand on the tee box and try again.`,
      });
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
  return NextResponse.json({ ok: true });
}
