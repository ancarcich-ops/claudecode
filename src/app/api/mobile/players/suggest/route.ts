// GET /api/mobile/players/suggest?q=...
// Auth: Bearer token. Player suggestions for the iOS start-a-round
// seats. Two modes:
// - No q: RECENT PARTNERS -- people seated in the caller's recent
//   matches, most recent first, each with the handicap they last
//   played at (the number you'd re-enter anyway).
// - With q: global user search, same ranking as the web new-match
//   autocomplete (/api/users/suggest).
// 200: { "players": [{ "userId", "username", "displayName",
//        "avatarUrl"|null, "lastHandicap"|null }] }

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  if (!q) {
    // Recent partners: seats in the caller's last 20 matches, keyed by
    // linked user, first (= most recent) occurrence wins.
    const recent = await prisma.match.findMany({
      where: {
        OR: [
          { createdById: user.id },
          { players: { some: { userId: user.id } } },
        ],
      },
      orderBy: { scheduledAt: "desc" },
      take: 20,
      select: {
        players: {
          select: {
            userId: true,
            displayName: true,
            handicap: true,
            user: {
              select: { username: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });
    // The caller's own last-played handicap, so the flow can pre-seat
    // "You" with the number they used last time.
    let myLastHandicap: number | null = null;
    for (const m of recent) {
      const mine = m.players.find((p) => p.userId === user.id);
      if (mine) {
        myLastHandicap = mine.handicap;
        break;
      }
    }
    const seen = new Set<string>([user.id]);
    const players: {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      lastHandicap: number | null;
    }[] = [];
    for (const m of recent) {
      for (const p of m.players) {
        if (!p.userId || !p.user || seen.has(p.userId)) continue;
        seen.add(p.userId);
        players.push({
          userId: p.userId,
          username: p.user.username,
          displayName: p.user.displayName ?? p.displayName,
          avatarUrl: p.user.avatarUrl ?? null,
          lastHandicap: p.handicap,
        });
        if (players.length >= 12) break;
      }
      if (players.length >= 12) break;
    }
    return NextResponse.json({ players, myLastHandicap });
  }

  // Search mode -- same DB filter + ranking as /api/users/suggest.
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
      ],
    } as never,
    take: 20,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });
  const qLower = q.toLowerCase();
  const score = (u: (typeof candidates)[number]): number => {
    const un = u.username.toLowerCase();
    const dn = (u.displayName ?? "").toLowerCase();
    if (un === qLower) return 0;
    if (un.startsWith(qLower)) return 1;
    if (dn.startsWith(qLower)) return 2;
    if (dn.split(/\s+/).some((w) => w.startsWith(qLower))) return 3;
    return 4;
  };
  const players = candidates
    .filter((u) => u.id !== user.id)
    .map((u) => ({ u, s: score(u) }))
    .sort((a, b) =>
      a.s !== b.s ? a.s - b.s : a.u.username.localeCompare(b.u.username),
    )
    .slice(0, 8)
    .map(({ u }) => ({
      userId: u.id,
      username: u.username,
      displayName: u.displayName ?? u.username,
      avatarUrl: u.avatarUrl ?? null,
      lastHandicap: null,
    }));
  return NextResponse.json({ players });
}
