import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "fm_user";

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

export function setSession(userId: string) {
  cookies().set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 1 year — no auth pretense, just identity persistence
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

export async function getCurrentUser() {
  const id = cookies().get(COOKIE)?.value;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}
