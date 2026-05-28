import Link from "next/link";
import WhoToggle from "./WhoToggle";
import type { Who } from "@/lib/identity";

export default function HeaderBar({
  who,
  momName,
  partnerName,
}: {
  who: Who;
  momName: string;
  partnerName: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-borderSoft bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 h-14">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <BloomMark />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            Bloom
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <WhoToggle who={who} momName={momName} partnerName={partnerName} />
          <Link
            href="/settings"
            aria-label="Settings"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-panel text-mute hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

function BloomMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden>
      <g transform="translate(32 33)">
        <g fill="rgb(var(--color-accent))">
          {[0, 72, 144, 216, 288].map((r) => (
            <ellipse key={r} cx="0" cy="-13" rx="7" ry="11" transform={`rotate(${r})`} />
          ))}
        </g>
        <circle cx="0" cy="0" r="6.5" fill="rgb(var(--color-gold))" />
      </g>
    </svg>
  );
}
