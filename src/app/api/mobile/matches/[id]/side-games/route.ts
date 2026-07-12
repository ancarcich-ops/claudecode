// POST /api/mobile/matches/:id/side-games -- set the enabled side games.
// Creator only; not allowed once the match is COMPLETED. Body:
// { "kinds": ["SKINS","STABLEFORD", …] }. Reconciles: removed kinds are
// deleted, added kinds created. NASSAU is dropped on 9-hole rounds. A
// configured TEAM_VS_TEAM row is preserved. Mirrors the web
// editMatchSideGamesAction. Advanced per-game config (Wolf rotation,
// stakes) stays on the web. 200: { "ok": true, "kinds": [...] }.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { isSideGameKind } from "@/lib/sideGames";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      createdById: true,
      status: true,
      holes: true,
      sideGames: { select: { id: true, kind: true, config: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the round's creator can edit side games." },
      { status: 403 },
    );
  }
  if (match.status === "COMPLETED") {
    return NextResponse.json(
      { error: "This round is final -- side games can't be changed." },
      { status: 400 },
    );
  }

  let kindsRaw: unknown;
  try {
    kindsRaw = (await req.json())?.kinds;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const kinds = Array.from(
    new Set(
      (Array.isArray(kindsRaw) ? kindsRaw : [])
        .map((k) => String(k))
        .filter(isSideGameKind)
        .filter((k) => !(k === "NASSAU" && match.holes !== 18)),
    ),
  );
  // Preserve a configured TEAM_VS_TEAM row (its team assignments live in
  // config and can't be re-created from mobile).
  const hasTvt = match.sideGames.some(
    (sg) => sg.kind === "TEAM_VS_TEAM" && sg.config,
  );
  if (hasTvt && !kinds.includes("TEAM_VS_TEAM")) kinds.push("TEAM_VS_TEAM");

  for (const sg of match.sideGames) {
    if (!kinds.includes(sg.kind as never)) {
      await prisma.sideGame.delete({ where: { id: sg.id } });
    }
  }
  for (const kind of kinds) {
    await prisma.sideGame.upsert({
      where: { matchId_kind: { matchId: match.id, kind } },
      update: {},
      create: { matchId: match.id, kind },
    });
  }

  return NextResponse.json({ ok: true, kinds });
}
