// GET /api/users/search?q=... -- open people search for the follow flow
// (web). Delegates to searchUsers in lib/follows.ts; see there for the
// matching rules (fuzzy username/name, exact email/phone, no enumeration).

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchUsers } from "@/lib/follows";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ users: [] }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const users = await searchUsers(me.id, q);
  return NextResponse.json({ users });
}
