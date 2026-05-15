import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActiveGroupId, listUserGroups } from "@/lib/groups";
import GroupSwitcher from "@/components/GroupSwitcher";

export const metadata: Metadata = {
  title: "Sticks",
  description: "A prediction market for golf rounds with friends.",
};

export const viewport: Viewport = {
  themeColor: "#0b0f0c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const groups = user ? await listUserGroups(user.id) : [];
  const activeGroupId = getActiveGroupId();
  // The leaderboard link only makes sense when a specific group is the
  // active filter -- "All my groups" and "Public only" don't map to a
  // single leaderboard page.
  const activeGroup =
    activeGroupId && activeGroupId !== "public"
      ? groups.find((g) => g.id === activeGroupId) ?? null
      : null;
  return (
    <html lang="en">
      <body>
        <header className="border-b border-border bg-panel/70 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto max-w-6xl px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 min-w-0 shrink"
            >
              <span className="text-accent text-lg shrink-0">⛳</span>
              <span className="font-semibold tracking-tight whitespace-nowrap">
                Sticks
              </span>
            </Link>
            <nav className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {user ? (
                <>
                  <Link
                    href="/"
                    className="btn btn-ghost px-2.5 sm:px-3 whitespace-nowrap text-xs"
                  >
                    Home
                  </Link>
                  <Link
                    href="/matches/new"
                    className="btn btn-primary px-2.5 sm:px-3 whitespace-nowrap"
                    aria-label="Post a new match"
                  >
                    <span aria-hidden>+</span>
                    <span>New match</span>
                  </Link>
                  {activeGroup && (
                    <Link
                      href={`/groups/${activeGroup.slug ?? activeGroup.id}/leaderboard`}
                      className="btn btn-ghost px-2.5 sm:px-3 whitespace-nowrap text-xs"
                    >
                      Leaderboard
                    </Link>
                  )}
                  <GroupSwitcher
                    groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                    active={activeGroupId}
                    username={user.username}
                  />
                </>
              ) : (
                <Link href="/login" className="btn btn-primary whitespace-nowrap">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-3 sm:px-4 py-5 sm:py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
