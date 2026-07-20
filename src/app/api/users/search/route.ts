// GET /api/users/search?q=... -- open people search for the follow flow.
// Matches username or display name (fuzzy, case-insensitive) across ALL
// users, plus an EXACT email match when the query looks like an email
// (so nobody can harvest emails by typing a partial string). Never
// returns anyone's email. Includes the caller's current follow state per
// result so the Follow button renders correctly.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { FollowState } from "@/lib/follows";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ users: [] }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q);

  const or: Record<string, unknown>[] = [
    { username: { contains: q, mode: "insensitive" } },
    { displayName: { contains: q, mode: "insensitive" } },
  ];
  // Exact email match only -- prevents partial-email enumeration. Email
  // is stored lowercased, so compare lowercased.
  if (looksLikeEmail) or.push({ email: q.toLowerCase() });

  const rows = await prisma.user.findMany({
    // `mode: "insensitive"` is Postgres-only; cast through `never` since
    // the locally-checked types are SQLite-based (prod is Postgres).
    // Mirrors src/app/api/users/suggest/route.ts.
    where: { id: { not: me.id }, OR: or } as never,
    take: 20,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarSeed: true,
      avatarVariant: true,
      avatarUrl: true,
    },
  });

  // My follow state toward each result (for the button).
  const follows = rows.length
    ? await prisma.follow.findMany({
        where: { followerId: me.id, followeeId: { in: rows.map((r) => r.id) } },
        select: { followeeId: true, status: true },
      })
    : [];
  const stateById = new Map<string, FollowState>();
  for (const f of follows) {
    stateById.set(f.followeeId, f.status === "ACCEPTED" ? "accepted" : "pending");
  }

  // Rank: exact username/email, then username prefix, then name prefix.
  const ql = q.toLowerCase();
  const ranked = rows
    .map((r) => {
      const un = r.username.toLowerCase();
      const dn = (r.displayName ?? "").toLowerCase();
      let rank = 4;
      if (un === ql) rank = 0;
      else if (un.startsWith(ql)) rank = 1;
      else if (dn.startsWith(ql)) rank = 2;
      else if (dn.split(/\s+/).some((w) => w.startsWith(ql))) rank = 3;
      return { r, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.r.username.localeCompare(b.r.username))
    .map(({ r }) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      avatarSeed: r.avatarSeed,
      avatarVariant: r.avatarVariant,
      avatarUrl: r.avatarUrl,
      followState: stateById.get(r.id) ?? ("none" as FollowState),
    }));

  return NextResponse.json({ users: ranked });
}
