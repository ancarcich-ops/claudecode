"use client";

// Group card for the redesigned /groups page (design handoff:
// "Groups Redesign" — Caddie's Notebook). Color spine + monogram
// identity block, member avatar stack, and a full-bleed footer split
// into Leaderboard and the invite "ticket" (tap = copy code + join
// link, with a 1.4s "Copied" confirmation overlay).
//
// Identity colors cycle deterministically from the group id so a
// group keeps its color across visits. Navy/rose extend the theme's
// accent set per the handoff; the rest map to existing tokens.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const SPINE_COLORS = [
  "rgb(var(--color-accent))",
  "rgb(var(--color-gold))",
  "#324A63", // navy (identity set)
  "rgb(var(--color-danger))", // clay
  "#9B5A6B", // rose (identity set)
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "#";
  const first = words[0][0];
  if (!/[a-zA-Z0-9]/.test(first)) return "#";
  const second = words.length > 1 ? words[1][0] : "";
  return (first + second).toUpperCase();
}

export default function GroupCard({
  id,
  name,
  slug,
  inviteCode,
  memberCount,
  matchCount,
  memberNames,
}: {
  id: string;
  name: string;
  slug: string | null;
  inviteCode: string;
  memberCount: number;
  matchCount: number;
  memberNames: string[];
}) {
  const spine = SPINE_COLORS[hashId(id) % SPINE_COLORS.length];
  const href = `/groups/${slug ?? id}`;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copyInvite = async () => {
    const origin = window.location.origin;
    const text = `${inviteCode} — ${origin}/groups/join?code=${inviteCode}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard denied -- leave the ticket as-is; the code is visible.
    }
  };

  const shownMembers = memberNames.slice(0, 3);
  const overflow = memberCount - shownMembers.length;

  return (
    <div className="relative overflow-hidden rounded-[16px] border border-border bg-panel shadow-[0_1px_0_rgba(33,29,22,0.03)]">
      {/* Color spine */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[5px]"
        style={{ background: spine }}
      />
      <div className="pl-[18px] pr-4 pt-[15px]">
        {/* Top row: identity, tappable -> group feed */}
        <Link href={href} className="flex items-center gap-[13px] min-w-0">
          <span
            className="w-[46px] h-[46px] rounded-[13px] grid place-items-center font-display font-semibold text-[20px] shrink-0 shadow-[inset_0_-2px_6px_rgba(0,0,0,0.14)]"
            style={{ background: spine, color: "rgb(var(--color-panel))" }}
          >
            {initialsOf(name)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-display font-semibold text-[20px] tracking-[-0.01em] text-ink truncate">
                {name}
              </span>
              <span aria-hidden className="text-[17px] text-faint shrink-0">
                →
              </span>
            </span>
            <span className="flex items-center gap-2 mt-[3px] font-mono text-[12px] text-mute">
              <span>
                <span className="text-ink font-medium">{memberCount}</span>{" "}
                member{memberCount === 1 ? "" : "s"}
              </span>
              <span
                aria-hidden
                className="w-[3px] h-[3px] rounded-full bg-faint opacity-60"
              />
              <span>
                <span className="text-ink font-medium">{matchCount}</span>{" "}
                match{matchCount === 1 ? "" : "es"}
              </span>
            </span>
          </span>
          {/* Member avatar stack */}
          {memberNames.length > 0 && (
            <span className="flex items-center shrink-0" aria-hidden>
              {shownMembers.map((n, i) => (
                <span
                  key={i}
                  className="w-[26px] h-[26px] rounded-full grid place-items-center font-sans font-bold text-[10px] border-2 border-panel first:ml-0 -ml-2"
                  style={{
                    background:
                      SPINE_COLORS[(hashId(id) + i + 1) % SPINE_COLORS.length],
                    color: "rgb(var(--color-panel))",
                  }}
                >
                  {initialsOf(n)}
                </span>
              ))}
              {overflow > 0 && (
                <span className="w-[26px] h-[26px] rounded-full grid place-items-center font-mono text-[10px] bg-panel2 text-mute border-2 border-panel -ml-2">
                  +{overflow}
                </span>
              )}
            </span>
          )}
        </Link>
      </div>
      {/* Full-bleed footer: Leaderboard | invite ticket */}
      <div className="mt-[14px] border-t border-borderSoft flex relative">
        <Link
          href={`${href}/leaderboard`}
          aria-disabled={matchCount === 0}
          className={
            "flex-1 h-[46px] flex items-center justify-center gap-1.5 font-sans font-semibold text-[13.5px] text-accent active:bg-accent/10 transition-colors " +
            (matchCount === 0 ? "opacity-50 pointer-events-none" : "")
          }
        >
          <svg
            aria-hidden
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M2.5 12.5v-4M7.5 12.5v-8M12.5 12.5v-6" />
          </svg>
          Leaderboard
        </Link>
        <span aria-hidden className="w-px bg-borderSoft" />
        <button
          type="button"
          onClick={copyInvite}
          className="flex-[1.15] h-[46px] flex items-center justify-center gap-2"
          aria-label={`Copy invite code ${inviteCode}`}
        >
          <span className="font-mono font-medium text-[13.5px] tracking-[0.14em] text-ink">
            {inviteCode}
          </span>
          <span
            className={
              "w-6 h-6 rounded-[7px] grid place-items-center transition-colors " +
              (copied
                ? "bg-accent text-ink-on-accent"
                : "bg-panel2 text-mute")
            }
          >
            <svg
              aria-hidden
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {copied ? (
                <path d="M2 6.5l2.5 2.5L10 3.5" />
              ) : (
                <>
                  <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
                  <path d="M8 4V3a1.5 1.5 0 0 0-1.5-1.5h-4A1.5 1.5 0 0 0 1 3v4A1.5 1.5 0 0 0 2.5 8.5H4" />
                </>
              )}
            </svg>
          </span>
          {copied && (
            <span className="absolute inset-0 bg-panel flex items-center justify-center gap-1.5 font-sans font-semibold text-[13.5px] text-accent">
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 7.5l3 3L11.5 4" />
              </svg>
              Copied
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
