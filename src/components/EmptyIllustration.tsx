// Lightweight SVG illustrations for empty states. Brand-consistent: emerald
// accent on the panel background, line-art only (no fills) so they read
// well at any size and don't fight the surrounding type.
import type { JSX } from "react";

const STROKE = "#34d399";
const MUTE = "#1f2a25";

export type EmptyKind =
  | "noMatches"
  | "noGroups"
  | "noLeaderboard"
  | "noStats"
  | "noStreak";

const ILLUSTRATIONS: Record<EmptyKind, () => JSX.Element> = {
  // A flagstick on an empty green -- "post the round, market opens".
  noMatches: () => (
    <svg
      viewBox="0 0 96 96"
      className="w-20 h-20"
      fill="none"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="48" cy="78" rx="34" ry="6" stroke={MUTE} />
      <line x1="48" y1="78" x2="48" y2="20" />
      <path d="M48 22 L70 28 L48 34 Z" fill={STROKE} stroke="none" />
      <circle cx="48" cy="78" r="2.5" fill={STROKE} stroke="none" />
    </svg>
  ),

  // Three intersecting club outlines -- "join up".
  noGroups: () => (
    <svg
      viewBox="0 0 96 96"
      className="w-20 h-20"
      fill="none"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="34" cy="40" r="14" />
      <circle cx="62" cy="40" r="14" />
      <circle cx="48" cy="62" r="14" />
    </svg>
  ),

  // Stacked bars rising -- "wins fill in".
  noLeaderboard: () => (
    <svg
      viewBox="0 0 96 96"
      className="w-20 h-20"
      fill="none"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="14" y="58" width="14" height="22" rx="2" />
      <rect x="34" y="42" width="14" height="38" rx="2" />
      <rect x="54" y="28" width="14" height="52" rx="2" />
      <rect x="74" y="16" width="6" height="64" rx="2" stroke={MUTE} />
    </svg>
  ),

  // Single tee shot trajectory -- "log your first round".
  noStats: () => (
    <svg
      viewBox="0 0 96 96"
      className="w-20 h-20"
      fill="none"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M14 78 Q 30 24 80 22" />
      <line x1="14" y1="78" x2="14" y2="84" />
      <circle cx="80" cy="22" r="3" fill={STROKE} stroke="none" />
    </svg>
  ),

  // A chain link broken at the end -- "no streak yet".
  noStreak: () => (
    <svg
      viewBox="0 0 96 96"
      className="w-20 h-20"
      fill="none"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="14" y="36" width="22" height="24" rx="10" />
      <rect x="44" y="36" width="22" height="24" rx="10" />
      <path d="M74 30 L82 38 M74 38 L82 30" stroke={MUTE} />
    </svg>
  ),
};

export default function EmptyIllustration({
  kind,
  title,
  body,
  action,
}: {
  kind: EmptyKind;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Illu = ILLUSTRATIONS[kind];
  return (
    <div className="card p-8 flex flex-col items-center text-center gap-3">
      <Illu />
      <div className="font-display text-lg font-semibold tracking-tight">
        {title}
      </div>
      {body && <p className="text-sm text-mute max-w-xs">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
