// POST /api/mobile/me/target-index
// Auth: Bearer token. Sets (or clears) the caller's goal handicap
// index -- the "TARGET 9.0 · 2.6 TO GO" line in the stats hero.
// Body: { "targetIndex": 9.0 } or { "targetIndex": null } to clear.
// Accepted range mirrors WHS: -10.0 .. 54.0, stored to one decimal.
// 200: { "ok": true, "targetIndex": 9.0 | null }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let raw: unknown;
  try {
    const body = await req.json();
    raw = body?.targetIndex;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  let value: number | null;
  if (raw === null || raw === undefined) {
    value = null;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < -10 || n > 54) {
      return NextResponse.json(
        { error: "Target must be between -10.0 and 54.0." },
        { status: 400 },
      );
    }
    value = Math.round(n * 10) / 10;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { targetIndex: value },
  });

  return NextResponse.json({ ok: true, targetIndex: value });
}
