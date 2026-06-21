import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeUserStats } from "@/lib/userStats";

export const dynamic = "force-dynamic";

// Global user search for the new-match form's player autocomplete.
// The DB filter checks both username and displayName so first/last
// names register (the previous in-process filter only saw the 100
// newest users, so older signups were invisible no matter what you
// typed).
//
// Ranking after the DB query:
//   0  exact username match
//   1  username starts with q
//   2  displayName starts with q (e.g. "andrew" -> "Andrew Carcich")
//   3  any word in displayName starts with q (e.g. "carcich" -> same)
//   4  any other contains match
//
// We over-fetch (20) then rank + slice to 8 so the highest-quality
// matches surface even when many users contain the substring.
//
// `mode: insensitive` is Postgres-only. Local SQLite dev gets
// case-sensitive matches, which is fine since prod is Postgres and
// the autocomplete is a help-text affordance, not a primary search.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ users: [] }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ users: [] });

  const candidates = await prisma.user.findMany({
    // `mode: "insensitive"` is Postgres-only. Cast through `never`
    // because the locally-checked Prisma types are SQLite-based and
    // omit `mode`, but the runtime DB in prod is Postgres and
    // accepts it. Local SQLite dev gets case-sensitive matches,
    // which is fine for a help-text autocomplete.
    where: {
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
      ],
    } as never,
    take: 20,
    select: { id: true, username: true, displayName: true },
  });

  const qLower = q.toLowerCase();
  const score = (u: (typeof candidates)[number]): number => {
    const un = u.username.toLowerCase();
    const dn = (u.displayName ?? "").toLowerCase();
    if (un === qLower) return 0;
    if (un.startsWith(qLower)) return 1;
    if (dn.startsWith(qLower)) return 2;
    // Word-boundary check so a last-name query ranks above a random
    // mid-string substring hit ("carcich" -> "Andrew Carcich" beats
    // "marcarcich-anything").
    if (dn.split(/\s+/).some((w) => w.startsWith(qLower))) return 3;
    return 4;
  };
  const matched = candidates
    .map((u) => ({ u, s: score(u) }))
    .sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s;
      // Stable tiebreak on username so the same query always returns
      // the same order between requests.
      return a.u.username.localeCompare(b.u.username);
    })
    .slice(0, 8)
    .map(({ u }) => u);

  // Attach each candidate's Sticks index (or null = pending) so the
  // form can prefill a real handicap instead of the hardcoded "15"
  // default. Computed in parallel; we only ship 8 results so the cost
  // is bounded.
  const enriched = await Promise.all(
    matched.map(async (u) => {
      const stats = await computeUserStats(u.id).catch(() => null);
      return {
        ...u,
        handicapIndex: stats?.handicap?.index ?? null,
      };
    }),
  );

  return NextResponse.json({ users: enriched });
}
