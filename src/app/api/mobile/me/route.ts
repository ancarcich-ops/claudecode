// GET /api/mobile/me
//   Auth: Bearer token. Token validity check + profile for app launch.
// DELETE /api/mobile/me
//   Auth: Bearer token. Permanently deletes the caller's account
//   (App Store Guideline 5.1.1(v)). Irreversible: all sessions are
//   revoked, so the bearer token is dead the moment this returns.

import { NextResponse } from "next/server";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import { deleteAccount } from "@/lib/account";

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

export async function DELETE(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();
  await deleteAccount(user.id);
  // The client should drop its stored token and return to the signed-out
  // state; every session (this token included) is already gone.
  return NextResponse.json({ ok: true });
}
