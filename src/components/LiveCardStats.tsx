"use client";

import { useState } from "react";
import RollingNumber from "./RollingNumber";
import PlayerAvatar, { isVariant } from "./Avatar";

type Player = {
  id: string;
  displayName: string;
  handicap: number;
  probability: number;
  liveScore: { holes: number; strokes: number; diff: number } | null;
  // Avatar customization (null when the seat isn't linked to a user account).
  avatarSeed?: string | null;
  avatarVariant?: string | null;
  avatarUrl?: string | null;
};

type SideGames = {
  stableford?: Record<string, number>;
  skins?: Record<string, number>;
};

type TabId = "ODDS" | "STABLEFORD" | "SKINS";

export default function LiveCardStats({
  players,
  sideGames,
}: {
  players: Player[];
  sideGames: SideGames;
}) {
  const tabs: { id: TabId; label: string }[] = [{ id: "ODDS", label: "Win %" }];
  if (sideGames.stableford) tabs.push({ id: "STABLEFORD", label: "Stableford" });
  if (sideGames.skins) tabs.push({ id: "SKINS", label: "Skins" });

  const [active, setActive] = useState<TabId>("ODDS");

  // Tabs sit inside a parent <Link>. Stop propagation so picking a tab
  // doesn't navigate to the match detail page.
  const swallow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Sort + value/label per active tab. The bar fills relative to the leader
  // so the visual stays in 0-100% space even when the metric is unbounded.
  const sorted = (() => {
    if (active === "STABLEFORD" && sideGames.stableford) {
      const sg = sideGames.stableford;
      return [...players].sort((a, b) => (sg[b.id] ?? 0) - (sg[a.id] ?? 0));
    }
    if (active === "SKINS" && sideGames.skins) {
      const sg = sideGames.skins;
      return [...players].sort((a, b) => (sg[b.id] ?? 0) - (sg[a.id] ?? 0));
    }
    return [...players].sort((a, b) => b.probability - a.probability);
  })();

  const maxFor = (kind: TabId) => {
    if (kind === "STABLEFORD" && sideGames.stableford) {
      return Math.max(1, ...Object.values(sideGames.stableford));
    }
    if (kind === "SKINS" && sideGames.skins) {
      return Math.max(1, ...Object.values(sideGames.skins));
    }
    return 1;
  };
  const ceiling = maxFor(active);

  const valueOf = (
    p: Player,
  ): {
    value: number;
    raw: number;
    format: (n: number) => string;
  } => {
    if (active === "STABLEFORD" && sideGames.stableford) {
      const v = sideGames.stableford[p.id] ?? 0;
      return {
        value: v / ceiling,
        raw: v,
        format: (n) => `${Math.round(n)} pt${Math.round(n) === 1 ? "" : "s"}`,
      };
    }
    if (active === "SKINS" && sideGames.skins) {
      const v = sideGames.skins[p.id] ?? 0;
      return {
        value: v / ceiling,
        raw: v,
        format: (n) => `${Math.round(n)} skin${Math.round(n) === 1 ? "" : "s"}`,
      };
    }
    return {
      value: p.probability,
      raw: p.probability * 100,
      format: (n) => `${Math.round(n)}%`,
    };
  };

  return (
    <>
      {tabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 mb-2" onClick={swallow}>
          {tabs.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={(e) => {
                  swallow(e);
                  setActive(t.id);
                }}
                className={
                  "text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors " +
                  (isActive
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-mute hover:text-ink")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
      <ul className="space-y-2">
        {sorted.map((p) => {
          const v = valueOf(p);
          return (
            <li key={p.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  <PlayerAvatar
                    seed={p.avatarSeed ?? p.id}
                    variant={
                      isVariant(p.avatarVariant ?? "beam")
                        ? (p.avatarVariant as
                            | "beam"
                            | "marble"
                            | "sunset"
                            | "pixel"
                            | "ring"
                            | "bauhaus")
                        : "beam"
                    }
                    avatarUrl={p.avatarUrl ?? null}
                    size={18}
                  />
                  <span className="truncate">
                    {p.displayName}{" "}
                    <span className="text-mute text-xs">
                      · hcp {p.handicap}
                    </span>
                  </span>
                </span>
                <RollingNumber
                  value={v.raw}
                  format={v.format}
                  className="font-mono tabular-nums text-accent shrink-0"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-panel2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/80"
                    style={{ width: `${Math.max(0, Math.min(1, v.value)) * 100}%` }}
                  />
                </div>
                {active === "ODDS" &&
                  (p.liveScore ? (
                    <span
                      className="text-[11px] font-mono tabular-nums shrink-0 flex items-baseline gap-1"
                      title={`${p.liveScore.strokes} strokes thru ${p.liveScore.holes}`}
                    >
                      <span
                        className={
                          p.liveScore.diff < 0
                            ? "text-accent"
                            : p.liveScore.diff === 0
                              ? "text-gold"
                              : "text-mute"
                        }
                      >
                        {p.liveScore.diff === 0
                          ? "E"
                          : p.liveScore.diff > 0
                            ? `+${p.liveScore.diff}`
                            : `${p.liveScore.diff}`}
                      </span>
                      <span className="text-mute/70">v par</span>
                      <span className="text-mute">·</span>
                      <span className="text-mute">{p.liveScore.strokes} strokes</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-mute font-mono shrink-0">
                      —
                    </span>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
