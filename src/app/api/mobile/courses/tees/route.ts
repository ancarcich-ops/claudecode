// GET /api/mobile/courses/tees?name=<course>
// Auth: Bearer token. The tee sets for a course, for the start-a-round
// tee picker. Always returns something usable: real tees when present,
// a synthesized default when only a course-level rating exists, or an
// empty list when the course has no rating data (the client then hides
// the tee picker and the round posts without a tee -> score-only
// handicap fallback).
// 200: { "tees": [{ "name", "rating", "slope", "yardage"|null,
//        "estimated" }], "defaultTeeName": string|null }

import { NextResponse, type NextRequest } from "next/server";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { getCourseTeeSet } from "@/lib/courseTees";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ tees: [], defaultTeeName: null });

  const { tees, defaultTeeName } = await getCourseTeeSet(name);
  return NextResponse.json({ tees, defaultTeeName });
}
