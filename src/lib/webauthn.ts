// WebAuthn / passkey helpers. Wraps @simplewebauthn/server with the
// app-specific bits: relying-party id/name/origin, base64url <-> bytes
// glue for the Prisma string columns, and DB-backed challenge storage
// (cookies don't survive cross-instance on Vercel; in-memory doesn't
// either). Two flows live here -- enrollment ("register" a passkey for
// an already-signed-in user) and sign-in ("authenticate" against a
// stored passkey, no user context).

import { prisma } from "./db";

// ---- Relying-party config -----------------------------------------------
// rpId is the registrable domain the passkey is bound to. MUST match the
// origin the browser is currently on (modulo subdomain rules). Set in env
// per-deploy: production = "sticks-app.vercel.app" (or your custom
// domain), local dev = "localhost".
export function rpId(): string {
  return process.env.WEBAUTHN_RP_ID || "localhost";
}

export function rpName(): string {
  return process.env.WEBAUTHN_RP_NAME || "Sticks";
}

// Origin must be the full URL the browser is loaded from. We accept a
// hint (from the request, when available) but also have an env override
// for cases where the deploy URL needs to be pinned.
export function expectedOrigin(): string {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN;
  const host = rpId();
  return host === "localhost" ? "http://localhost:3000" : `https://${host}`;
}

// ---- Challenge storage --------------------------------------------------
// 5-minute TTL is well under the WebAuthn spec's recommended max and
// long enough for a Face ID prompt + slow network.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function storeChallenge(
  challenge: string,
  kind: "registration" | "authentication",
  userId: string | null,
): Promise<void> {
  await prisma.webauthnChallenge.create({
    data: {
      challenge,
      kind,
      userId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

// Look up + delete a challenge in one step (single-use). Returns null
// when it's been used, expired, or never existed -- caller treats null
// as "verification fails."
export async function consumeChallenge(
  challenge: string,
  kind: "registration" | "authentication",
): Promise<{ userId: string | null } | null> {
  const row = await prisma.webauthnChallenge
    .findUnique({ where: { challenge } })
    .catch(() => null);
  if (!row) return null;
  // Always delete (best-effort), then validate.
  await prisma.webauthnChallenge.delete({ where: { id: row.id } }).catch(() => {});
  if (row.kind !== kind) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { userId: row.userId };
}

// Opportunistic cleanup of expired challenges. Cheap; safe to call from
// any of the WebAuthn entry points so the table doesn't grow unbounded
// on a write-heavy deploy.
export async function sweepExpiredChallenges(): Promise<void> {
  await prisma.webauthnChallenge
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
}

// ---- base64url <-> bytes glue ------------------------------------------
// We store credential id + public key as base64url strings (works
// uniformly on sqlite + postgres without the Bytes type's serialization
// gotchas). simplewebauthn hands us either bytes or base64url depending
// on the call; centralise the conversion here.
export function bytesToBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return Buffer.from(bin, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  // Allocate a fresh ArrayBuffer (not the Buffer's pooled SharedArrayBuffer)
  // so TypeScript's Uint8Array<ArrayBuffer> constraint -- required by
  // simplewebauthn -- is satisfied.
  const src = Buffer.from(b64, "base64");
  const out = new Uint8Array(new ArrayBuffer(src.length));
  out.set(src);
  return out;
}

// ---- Friendly device label guess ---------------------------------------
// When the user enrolls a passkey we let them name it ("Andre's iPhone")
// but pre-fill a reasonable default from their User-Agent string. The
// guess is intentionally coarse -- they can rename in Settings.
export function guessDeviceName(userAgent: string | null): string {
  if (!userAgent) return "This device";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("android")) return "Android phone";
  if (ua.includes("windows")) return "Windows PC";
  return "This device";
}
