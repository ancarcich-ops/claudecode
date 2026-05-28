"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Segmented control linking the Cravings / Hated lists.
export default function ListNav() {
  const pathname = usePathname();
  const items = [
    { href: "/cravings", label: "🍓 Cravings" },
    { href: "/hated", label: "🤢 Hated" },
  ];
  return (
    <div className="flex rounded-full border border-border bg-panel p-1 text-sm font-semibold">
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex-1 rounded-full py-2 text-center transition-colors ${
              active ? "bg-accent text-ink-on-accent" : "text-mute"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
