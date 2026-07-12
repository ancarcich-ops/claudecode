// POST /api/mobile/matches/:id/pars -- edit the round's per-hole pars.
// Creator only; allowed any status (fixing a wrong par mid-round is
// legitimate). Body: { "pars": [4,5,3, …] } exactly `holes` entries,
// each 3–6. Re-records an odds snapshot. Mirrors the web
// updateParsAction. 200: { "ok": true, "pars": [...] }.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { recordOddsSnapshot } from "@/lib/match";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { id: true, createdById: true, holes: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the round's creator can edit pars." },
      { status: 403 },
    );
  }

  let pars: unknown;
  try {
    pars = (await req.json())?.pars;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!Array.isArray(pars) || pars.length !== match.holes) {
    return NextResponse.json(
      { error: `Need exactly ${match.holes} pars.` },
      { status: 400 },
    );
  }
  const nums = pars.map((p) => Number(p));
  if (nums.some((p) => !Number.isFinite(p) || p < 3 || p > 6)) {
    return NextResponse.json(
      { error: "Pars must be 3, 4, 5, or 6." },
      { status: 400 },
    );
  }
  const clean = nums.map((p) => Math.round(p));

  await prisma.match.update({
    where: { id: match.id },
    data: { parData: JSON.stringify(clean) },
  });
  await recordOddsSnapshot(match.id);

  return NextResponse.json({ ok: true, pars: clean });
}
