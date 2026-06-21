import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  Archivo,
  Bricolage_Grotesque,
  DM_Mono,
  Figtree,
  Hanken_Grotesk,
  JetBrains_Mono,
  Karla,
  Newsreader,
  Space_Grotesk,
} from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getCurrentUser } from "@/lib/auth";
import { getActiveGroupId, listUserGroups } from "@/lib/groups";
import GroupSwitcher from "@/components/GroupSwitcher";
import StickMark from "@/components/brand/StickMark";
import MobileTabBar from "@/components/MobileTabBar";
import Onboarding from "@/components/Onboarding";
import Sounds from "@/components/Sounds";
import SticksSplash from "@/components/SticksSplash";
import { Toaster } from "sonner";

// Caddie's Notebook is the default skin: Newsreader = display + wordmark,
// Karla = body, DM Mono = numerics. The other three skins (Fairway /
// Blueprint / Back Nine) layer in their own display+sans+mono trio
// below; globals.css points --font-display / --font-sans / --font-mono
// at the right pair per theme. All fonts use display:swap so the
// fallback paints first and the swap is invisible.
//
// Every family is registered under a unique --font-* variable (not
// --font-display directly) so the theme-selection rules in globals.css
// can pick among them without colliding with the next/font className
// assignment.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});
const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});
const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
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
  // Bone paper -- the Caddie's Notebook bg, which is the default skin.
  // iOS status-bar tint shows briefly on first paint; users on a
  // non-default theme accept a one-tick mismatch (Safari only allows
  // a single static themeColor here, no media-query swap).
  themeColor: "#EDE7DB",
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
  const fontVars = [
    bricolage.variable,
    GeistSans.variable,
    GeistMono.variable,
    newsreader.variable,
    karla.variable,
    dmMono.variable,
    spaceGrotesk.variable,
    hankenGrotesk.variable,
    jetbrainsMono.variable,
    archivo.variable,
    figtree.variable,
  ].join(" ");
  return (
    <html lang="en" className={fontVars}>
      <head>
        {/* Apply the saved theme before paint so users on a non-default
            skin don't flash Caddie's first. Script is intentionally tiny
            and runs synchronously in <head>. Valid stored values are
            "fairway" | "blueprint" | "backnine"; anything else (or
            unset) falls through to Caddie's Notebook on :root. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("sticks-theme");if(t==="fairway"||t==="blueprint"||t==="backnine")document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>
        <header className="border-b border-border bg-panel/70 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto max-w-6xl px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 min-w-0 shrink"
            >
              <StickMark
                size={22}
                color="currentColor"
                title={null}
                className="shrink-0 text-accent"
              />
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
        <main className="mx-auto max-w-6xl px-3 sm:px-4 py-5 sm:py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
          {children}
        </main>
        {user && <MobileTabBar />}
        {/* First-cold-load splash. Renders nothing on subsequent
            navigations within the session -- guarded by
            sessionStorage inside the component. */}
        <SticksSplash />
        <Onboarding
          enabled={!!user}
          username={user?.username}
          hasGroup={groups.length > 0}
          photoUploadEnabled={!!process.env.BLOB_READ_WRITE_TOKEN}
        />
        <Sounds />
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "rgb(var(--color-panel2))",
              border: "1px solid rgb(var(--color-border))",
              color: "rgb(var(--color-ink))",
            },
          }}
        />
      </body>
    </html>
  );
}
