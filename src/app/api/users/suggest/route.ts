import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeUserStats } from "@/lib/userStats";

export const dynamic = "force-dynamic";

// Global user search for the new-match form's player autocomplete.
// Intentionally simple: pull a recent slice of users, filter in JS by
// case-insensitive substring on either username or displayName.
//
// Reason: Prisma's `mode: "insensitive"` is Postgres-only and crashes
// on SQLite (our local dev DB), and the user count during testing is
// small enough that in-process filtering is cheaper than a portability
// shim. Swap this for an indexed query when the table grows.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ users: [] }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return NextResponse.json({ users: [] });

  const recent = await prisma.user.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    select: { id: true, username: true, displayName: true },
  });

  const matched = recent
    .filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.displayName?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 8);

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
