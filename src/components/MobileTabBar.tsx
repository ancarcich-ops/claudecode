"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sticky bottom navigation on small screens. Hidden on sm+ where the
// header nav has room to breathe. The "+ New" shortcut lives in the
// header now -- this row is reserved for primary navigation only.
type Tab = {
  href: string;
  label: string;
  icon: (p: IconProps) => JSX.Element;
  accent?: boolean;
};
const TABS: Tab[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/groups", label: "Groups", icon: GroupsIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/stats", label: "Stats", icon: StatsIcon },
];

export default function MobileTabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-panel"
      role="navigation"
      aria-label="Primary"
      // iOS Safari quirk: as the address bar collapses on scroll, the
      // visual viewport grows but `position: fixed` is layout-viewport
      // based. The element appears to drift up mid-page. Forcing the
      // bar onto its own compositor layer (translateZ + will-change)
      // pins it to the visual viewport bottom across the URL-bar
      // animation.
      style={{
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <div className="grid grid-cols-4 mx-auto max-w-md">
        {TABS.map((t) => {
          const active =
            t.href === "/"
              ? pathname === "/"
              : pathname === t.href || pathname.startsWith(t.href + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] uppercase tracking-wider transition-colors " +
                (active ? "text-accent" : "text-mute hover:text-ink")
              }
            >
              <Icon active={active} accent={t.accent} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
      {/* iOS home indicator spacer */}
      <div className="h-[env(safe-area-inset-bottom)]" aria-hidden />
    </nav>
  );
}

type IconProps = { active: boolean; accent?: boolean };

function HomeIcon({}: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function GroupsIcon({}: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function StatsIcon({}: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function SettingsIcon({}: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
