// POST /api/mobile/auth/signup
// Body: { username, email, password, displayName?, phone? }
// 200: { token, user: { id, username, displayName } }  -- same shape as
//   /auth/login, so the client stores the token and drops straight in.
// 400: { error } -- validation failure or username/email already taken.
//
// Mirrors the web signUpAction (src/lib/actions.ts): same username /
// email / password rules and the same uniqueness checks. `phone` is
// optional and normalized to the last-10 digits so friends can find you
// in people-search; an unparseable number is silently dropped (the
// account still gets created) rather than blocking sign-up.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, passwordError } from "@/lib/password";
import { createMobileSession } from "@/lib/mobileAuth";
import { normalizePhone } from "@/lib/follows";

export const dynamic = "force-dynamic";

// Keep in sync with the same constants in src/lib/actions.ts.
const USERNAME_RE = /^[A-Za-z0-9._-]{2,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  let body: {
    username?: unknown;
    email?: unknown;
    password?: unknown;
    displayName?: unknown;
    phone?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim() || null;
  // Optional. normalizePhone returns null for anything under 10 digits,
  // so a blank or junk value just leaves the account phone-less.
  const phoneRaw = String(body.phone ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 2–20 chars: letters, numbers, . _ -" },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  const pwErr = passwordError(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  // Uniqueness: email is stored lowercased (case-insensitive match);
  // username matched exactly.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });
  if (existing) {
    if (existing.email === email) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "That username is taken." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, displayName, phone },
  });
  const token = await createMobileSession(user.id);

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? user.username,
    },
  });
}
