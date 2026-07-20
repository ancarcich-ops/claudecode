// /api/mobile/follows  (Bearer)
//
// GET  -> { requests: [{ user, since }], following: [user], followers:
//          [user], autoAcceptFollows, phone } for the native People
//          screen. `phone` is the caller's own (safe to return).
//
// POST -> perform a follow action. Body: { action, userId?, on?, phone? }
//   action "request"       userId=target  -> { ok, state }
//   action "unfollow"      userId=target  -> { ok }
//   action "accept"        userId=follower -> { ok }
//   action "decline"       userId=follower -> { ok }
//   action "setAutoAccept" on:boolean      -> { ok }
//   action "setPhone"      phone:string    -> { ok, phone }  ("" removes)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";
import {
  listPendingRequests,
  listFollowers,
  listFollowing,
  requestFollow,
  unfollow,
  respondToFollow,
  setAutoAccept,
  normalizePhone,
} from "@/lib/follows";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const [requests, following, followers, me] = await Promise.all([
    listPendingRequests(user.id),
    listFollowing(user.id),
    listFollowers(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { autoAcceptFollows: true, phone: true },
    }),
  ]);

  return NextResponse.json({
    requests: requests.map((r) => ({ user: r.user, since: r.since })),
    following,
    followers,
    autoAcceptFollows: me?.autoAcceptFollows ?? false,
    phone: me?.phone ?? null,
  });
}

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const userId = String(body.userId ?? "").trim();

  switch (action) {
    case "request": {
      const state = await requestFollow(user.id, userId);
      return NextResponse.json({ ok: true, state });
    }
    case "unfollow":
      await unfollow(user.id, userId);
      return NextResponse.json({ ok: true });
    case "accept":
      await respondToFollow(user.id, userId, true);
      return NextResponse.json({ ok: true });
    case "decline":
      await respondToFollow(user.id, userId, false);
      return NextResponse.json({ ok: true });
    case "setAutoAccept":
      await setAutoAccept(user.id, body.on === true);
      return NextResponse.json({ ok: true });
    case "setPhone": {
      const raw = String(body.phone ?? "").trim();
      const phone = raw === "" ? null : normalizePhone(raw) ?? undefined;
      await prisma.user.update({ where: { id: user.id }, data: { phone } });
      return NextResponse.json({ ok: true, phone: raw === "" ? null : phone });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
