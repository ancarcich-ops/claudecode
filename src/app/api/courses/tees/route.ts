// GET /api/courses/tees?name=<course>
// Tee sets for the new-match form's per-player tee picker. Session-
// gated (any signed-in user); course rating data isn't sensitive.
// 200: { tees: [{ name, gender, rating, slope, yardage, estimated }],
//        defaultTeeName: string|null }

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCourseTeeSet } from "@/lib/courseTees";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ tees: [], defaultTeeName: null });

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ tees: [], defaultTeeName: null });

  const { tees, defaultTeeName } = await getCourseTeeSet(name);
  return NextResponse.json({ tees, defaultTeeName });
}
