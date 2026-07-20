// GET /api/mobile/users/search?q=  (Bearer)
// Open people search for the native follow flow. Same rules as the web
// endpoint (fuzzy username/name; exact email/phone; never returns
// email/phone; includes the caller's follow state per result).

import { NextResponse } from "next/server";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { searchUsers } from "@/lib/follows";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const users = await searchUsers(user.id, q);
  return NextResponse.json({ users });
}
