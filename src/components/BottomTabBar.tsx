"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/cravings", label: "Cravings", icon: "🍓" },
  { href: "/trends", label: "Trends", icon: "📊" },
  { href: "/wild", label: "Wild", icon: "✨" },
];

export default function BottomTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Split the tabs around the raised center "+" button.
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-borderSoft bg-bg/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-2xl grid-cols-5 items-center px-2 h-16">
        {left.map((t) => (
          <TabLink key={t.href} tab={t} active={isActive(t.href)} />
        ))}
        <div className="flex justify-center">
          <Link
            href="/log"
            aria-label="Log a craving"
            className="grid h-14 w-14 -translate-y-3 place-items-center rounded-full bg-accent text-2xl text-ink-on-accent shadow-lg shadow-accent/30 transition-transform active:scale-90"
          >
            +
          </Link>
        </div>
        {right.map((t) => (
          <TabLink key={t.href} tab={t} active={isActive(t.href)} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      className={`flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold transition-colors ${
        active ? "text-accent" : "text-faint"
      }`}
    >
      <span className={`text-lg leading-none ${active ? "" : "grayscale opacity-70"}`}>
        {tab.icon}
      </span>
      {tab.label}
    </Link>
  );
}
