import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/lib/actions";
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
                  <GroupSwitcher
                    groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                    active={activeGroupId}
                  />
                  <Link
                    href="/groups"
                    className="btn btn-ghost px-2.5 sm:px-3 whitespace-nowrap text-xs"
                    title="Manage groups"
                  >
                    <span className="hidden sm:inline">Groups</span>
                    <span className="sm:hidden" aria-hidden>
                      ⚑
                    </span>
                  </Link>
                  <Link
                    href="/matches/new"
                    className="btn btn-primary px-2.5 sm:px-3 whitespace-nowrap"
                    aria-label="Post a new match"
                  >
                    <span aria-hidden>+</span>
                    <span className="hidden sm:inline">New match</span>
                    <span className="sm:hidden">New</span>
                  </Link>
                  <span className="chip whitespace-nowrap hidden sm:inline-flex max-w-[10rem] truncate">
                    @{user.username}
                  </span>
                  <form action={signOutAction}>
                    <button
                      className="btn btn-ghost px-2.5 sm:px-3 whitespace-nowrap"
                      type="submit"
                      aria-label="Sign out"
                      title="Sign out"
                    >
                      <SignOutIcon />
                      <span className="hidden sm:inline">Sign out</span>
                    </button>
                  </form>
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

function SignOutIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
