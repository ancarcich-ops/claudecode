import { cookies } from "next/headers";

// This is a private two-person app shared by URL — no passwords. The only
// "identity" we keep is which of the two people is currently logging, stored
// in a long-lived cookie so each phone remembers its owner. It only ever
// attributes entries; it gates nothing.
export type Who = "geena" | "daddy";

const WHO_COOKIE = "bloom-who";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function getWho(): Who | null {
  const v = cookies().get(WHO_COOKIE)?.value;
  return v === "geena" || v === "daddy" ? v : null;
}

// Defaults to geena so first-time logging still attributes sensibly before
// the picker is touched.
export function getWhoOrDefault(): Who {
  return getWho() ?? "geena";
}

export function setWhoCookie(who: Who) {
  cookies().set(WHO_COOKIE, who, {
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}
