import type { User } from "@prisma/client";

// Admin gating reads from an env var so we don't have to recompile to
// grant access. Set ADMIN_USERNAMES="seuss,jordan,etc" in your Vercel
// project (Production at minimum). Single user works too.
export function isUserAdmin(user: Pick<User, "username"> | null): boolean {
  if (!user) return false;
  const raw = process.env.ADMIN_USERNAMES ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.includes(user.username.toLowerCase());
}
