// Bearer-token auth for the mobile API (/api/mobile/*).
//
// The web app stores an opaque session token in an httpOnly cookie;
// the native app sends the SAME kind of token as an Authorization
// header instead. Both map to the Session table, so there's one
// session model, one TTL, one revocation path (delete the row).

import { randomBytes } from "node:crypto";
import { prisma } from "./db";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;

// Resolve the caller from `Authorization: Bearer <token>`. Returns
// null (never throws) so routes can produce a clean 401.
export async function getUserFromBearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const session = await prisma.session.findUnique({
    where: { token: m[1].trim() },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

// Mint a session row for a mobile login. Same shape as the cookie
// sessions minted by src/lib/auth.ts setSession, minus the cookie.
export async function createMobileSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return token;
}

export function unauthorized() {
  return Response.json({ error: "Not signed in" }, { status: 401 });
}
