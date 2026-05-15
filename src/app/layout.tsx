import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getCurrentUser } from "@/lib/auth";
import { getActiveGroupId, listUserGroups } from "@/lib/groups";
import GroupSwitcher from "@/components/GroupSwitcher";
import MobileTabBar from "@/components/MobileTabBar";
import Onboarding from "@/components/Onboarding";
import Sounds from "@/components/Sounds";
import { Toaster } from "sonner";

// Per the brand kit: Bricolage = display + wordmark, Geist = body,
// Geist Mono = tabular numerics. Bricolage via next/font/google;
// Geist via the official `geist` npm package (Vercel's house sans,
// already preconfigured with --font-geist-sans / --font-geist-mono
// CSS variables, which we re-alias to --font-sans / --font-mono below).
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sticks",
  description: "All your games. One round.",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sticks",
    statusBarStyle: "black-translucent",
  },
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
    <html
      lang="en"
      className={`${display.variable} ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <header className="border-b border-border bg-panel/70 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto max-w-6xl px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 min-w-0 shrink"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 64 64"
                fill="#34d399"
                aria-hidden
                className="shrink-0"
              >
                <rect x="13" y="14" width="8" height="40" rx="2.5" />
                <rect x="28" y="6" width="8" height="50" rx="2.5" />
                <rect x="43" y="22" width="8" height="28" rx="2.5" />
              </svg>
              <span className="font-display font-semibold tracking-tight whitespace-nowrap text-base">
                Sticks<span className="text-accent">.</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {user ? (
                <>
                  <Link
                    href="/"
                    className="btn btn-ghost px-3 whitespace-nowrap"
                  >
                    Home
                  </Link>
                  <Link
                    href="/matches/new"
                    className="btn btn-primary px-3 whitespace-nowrap"
                    aria-label="Post a new match"
                  >
                    <span aria-hidden>+</span>
                    <span>New match</span>
                  </Link>
                  <GroupSwitcher
                    groups={groups.map((g) => ({
                      id: g.id,
                      name: g.name,
                      slug: g.slug,
                    }))}
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
        <main className="mx-auto max-w-6xl px-3 sm:px-4 py-5 sm:py-6 pb-24 sm:pb-6">
          {children}
        </main>
        {user && <MobileTabBar />}
        <Onboarding enabled={!!user} />
        <Sounds />
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "#161f1b",
              border: "1px solid #1f2a25",
              color: "#e8f0ea",
            },
          }}
        />
      </body>
    </html>
  );
}
