// GET /api/mobile/me
// Auth: Bearer token. Token validity check + profile for app launch.

import { NextResponse } from "next/server";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? user.username,
    },
  });
}
