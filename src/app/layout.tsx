import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/lib/actions";

export const metadata: Metadata = {
  title: "Fairway Market",
  description: "A no-money prediction market for golf rounds with friends.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-accent text-lg">⛳</span>
              <span className="font-semibold tracking-tight">
                Fairway Market
              </span>
              <span className="chip ml-2">no money · just bragging</span>
            </Link>
            <nav className="flex items-center gap-2">
              {user ? (
                <>
                  <Link
                    href="/matches/new"
                    className="btn btn-primary"
                  >
                    + New match
                  </Link>
                  <span className="chip">@{user.username}</span>
                  <form action={signOutAction}>
                    <button className="btn btn-ghost" type="submit">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn btn-primary">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-mute">
          Odds are entertainment-only. No wagers, no money, no payouts.
        </footer>
      </body>
    </html>
  );
}
