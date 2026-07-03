// POST /api/mobile/auth/login
// Body: { identifier: string (username or email), password: string }
// 200: { token, user: { id, username, displayName } }
// 401: { error } (generic -- never reveals whether the account exists)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createMobileSession } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { identifier?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const identifier = String(body.identifier ?? "").trim();
  const password = String(body.password ?? "");
  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Enter your username/email and password." },
      { status: 400 },
    );
  }
  const isEmail = identifier.includes("@");
  const user = await prisma.user.findFirst({
    where: isEmail
      ? { email: identifier.toLowerCase() }
      : { username: identifier },
  });
  const ok = user && (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) {
    return NextResponse.json(
      { error: "Incorrect username/email or password." },
      { status: 401 },
    );
  }
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
