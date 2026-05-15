import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "./db";

// Server-side session token cookie. Replaces the legacy fm_user cookie
// (which stored the User.id directly -- guessable / replayable). New
// cookie holds an opaque token that maps to a Session row server-side.
const SESSION_COOKIE = "fm_session";
const LEGACY_USER_COOKIE = "fm_user";

// Sessions last a year unless explicitly signed out. Long-lived because
// users rarely sign back in on a phone.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;

export async function getOrCreateUser(username: string) {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("Username required");
  const user = await prisma.user.upsert({
    where: { username: trimmed },
    update: {},
    create: { username: trimmed },
  });
  return user;
}

function mintToken(): string {
  // 32 bytes hex = 64 chars. Opaque and unguessable.
  return randomBytes(32).toString("hex");
}

export async function setSession(userId: string) {
  const token = mintToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({
    data: { token, userId, expiresAt },
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  // If the user still has the legacy cookie around, retire it so we don't
  // fall back to it on subsequent requests.
  cookies().delete(LEGACY_USER_COOKIE);
}

export async function clearSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .delete({ where: { token } })
      .catch(() => {
        // Already gone -- nothing to do.
      });
  }
  cookies().delete(SESSION_COOKIE);
  cookies().delete(LEGACY_USER_COOKIE);
}

export async function getCurrentUser() {
  // Prefer the new session-token cookie.
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (session && session.expiresAt > new Date()) {
      return session.user;
    }
    // Expired or stale token; treat as signed out.
    return null;
  }
  // Legacy fallback: existing users on the old fm_user cookie. Validate the
  // id and silently upgrade them to a real session on their next request.
  const legacyId = cookies().get(LEGACY_USER_COOKIE)?.value;
  if (legacyId) {
    const user = await prisma.user.findUnique({ where: { id: legacyId } });
    if (user) {
      try {
        await setSession(user.id);
      } catch {
        // Setting cookies can fail outside an action / route handler context.
        // We still return the user so the request proceeds; next allowed
        // write context will upgrade them.
      }
      return user;
    }
  }
  return null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}
