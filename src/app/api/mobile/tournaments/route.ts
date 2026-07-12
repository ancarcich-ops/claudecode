// GET  /api/mobile/tournaments      -- the caller's tournaments (created or joined).
// POST /api/mobile/tournaments      -- create a tournament (caller auto-joins).
// Mirrors the web listTournamentsForUser + createTournamentAction.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { listTournamentsForUser } from "@/lib/tournaments";
import { generateInviteCode } from "@/lib/groups";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const rows = await listTournamentsForUser(user.id);
  return NextResponse.json({
    tournaments: rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      scoringMode: t.scoringMode,
      roundsPlanned: t.roundsPlanned,
      // rounds actually completed so far.
      roundsPlayed: t.matches.filter((m) => m.status === "COMPLETED").length,
      playerCount: t.roster.length,
      isCreator: t.createdById === user.id,
      inviteCode: t.inviteCode, // members share this to add players
      createdAt: t.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: {
    name?: unknown;
    scoringMode?: unknown;
    roundsPlanned?: unknown;
    scheduledStartAt?: unknown;
    notes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "Tournament name required." },
      { status: 400 },
    );
  }
  const scoringMode = String(body.scoringMode ?? "NET") === "GROSS" ? "GROSS" : "NET";
  const roundsRaw = parseInt(String(body.roundsPlanned ?? "2"), 10);
  const roundsPlanned = Number.isFinite(roundsRaw)
    ? Math.max(1, Math.min(12, roundsRaw))
    : 2;
  const startRaw = String(body.scheduledStartAt ?? "").trim();
  const scheduledStartAt = startRaw ? new Date(startRaw) : null;
  if (scheduledStartAt && Number.isNaN(scheduledStartAt.getTime())) {
    return NextResponse.json({ error: "Bad start time." }, { status: 400 });
  }
  const notes = String(body.notes ?? "").trim() || null;

  // Unique invite code with collision retry (column isn't @unique).
  let inviteCode = generateInviteCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.tournament.findFirst({
      where: { inviteCode },
      select: { id: true },
    });
    if (!existing) break;
    inviteCode = generateInviteCode();
  }

  const tournament = await prisma.tournament.create({
    data: {
      name,
      inviteCode,
      scoringMode,
      roundsPlanned,
      scheduledStartAt,
      notes,
      createdById: user.id,
      // Creator auto-joins the roster.
      roster: {
        create: [
          {
            displayName: user.displayName ?? user.username,
            userId: user.id,
            handicapAtStart: null,
          },
        ],
      },
    },
    select: { id: true, inviteCode: true },
  });

  return NextResponse.json({
    tournament: { id: tournament.id, inviteCode: tournament.inviteCode },
  });
}
