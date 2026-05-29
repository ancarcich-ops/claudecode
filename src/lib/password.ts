import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Password hashing with Node's built-in scrypt -- no external deps.
// Stored format: `scrypt$<saltHex>$<hashHex>`. scrypt is memory-hard
// and a solid choice for password storage; we use the standard cost
// parameters (N=16384 via keylen 64).

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  let derived: Buffer;
  try {
    derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  } catch {
    return false;
  }
  // Constant-time compare to avoid leaking timing information.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// Minimum-strength gate shared by signup + reset. Keep it simple but
// non-trivial: 8+ chars. Returns an error string or null when valid.
export function passwordError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}
