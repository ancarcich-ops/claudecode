import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { Toaster } from "sonner";
import BottomTabBar from "@/components/BottomTabBar";
import HeaderBar from "@/components/HeaderBar";
import { getSettings } from "@/lib/settings";
import { getWhoOrDefault } from "@/lib/identity";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "opsz"],
});

const body = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bloom — Geena's Cravings",
  description: "A sweet little tracker for Geena's pregnancy cravings 🌸",
  icons: { icon: "/icon.svg", apple: "/apple-icon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Bloom",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ec7ba4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, who] = await Promise.all([
    getSettings(),
    Promise.resolve(getWhoOrDefault()),
  ]);

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("bloom-theme");if(t==="dark")document.documentElement.dataset.theme="dark";}catch(e){}`,
          }}
        />
      </head>
      <body>
        <HeaderBar
          who={who}
          momName={settings.momName}
          partnerName={settings.partnerName}
        />
        <main className="mx-auto max-w-2xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <BottomTabBar />
        <Toaster
          position="top-center"
          theme="system"
          toastOptions={{
            style: {
              background: "rgb(var(--color-panel))",
              border: "1px solid rgb(var(--color-border))",
              color: "rgb(var(--color-ink))",
              borderRadius: "16px",
            },
          }}
        />
      </body>
    </html>
  );
}
