"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { logScoreAction } from "@/lib/actions";
import PlayerAvatar, { isVariant, type AvatarVariant } from "@/components/Avatar";

// In-round scoring view per IN_ROUND_SCREENS_SPEC.md §1. Replaces the
// old long stack of cards on the scorecard tab with the live-round
// hierarchy: score-to-par leads, the multi-player scorecard auto-
// centers on the current hole, and a single Standings card switches
// between the live market and each side game without splitting into
// separate cards.

export type InRoundPlayer = {
  id: string;
  displayName: string;
  color: string;
  handicap: number;
  // Score per absolute hole number, missing keys = unscored.
  scoresByHole: Record<number, number>;
  // From the odds engine (theme/seat color, win probability, net score
  // projection). Pre-computed in page.tsx and passed straight through.
  probability: number;
  netScore: number | null;
  // Avatar customization. Empty/null when the player isn't a Sticks
  // account; the Avatar component falls back to a seed-based generated
  // mark.
  avatarSeed?: string | null;
  avatarVariant?: string | null;
  avatarUrl?: string | null;
};

// Reusable avatar bubble that renders the user's photo or generated
// boring-avatar, with the seat color as a thin ring fallback for free-
// typed players (no Sticks account).
function PlayerBubble({
  player,
  size,
}: {
  player: InRoundPlayer;
  size: number;
}) {
  const variant: AvatarVariant =
    player.avatarVariant && isVariant(player.avatarVariant)
      ? (player.avatarVariant as AvatarVariant)
      : "beam";
  return (
    <span
      className="inline-block rounded-full shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 1.5px ${player.color}`,
      }}
    >
      <PlayerAvatar
        seed={player.avatarSeed ?? player.displayName}
        variant={variant}
        avatarUrl={player.avatarUrl ?? null}
        size={size}
      />
    </span>
  );
}

export type SideGameRow = { hole: number } & Record<string, number>;

export type InRoundProps = {
  matchId: string;
  courseName: string;
  holes: number;
  startingHole: number;
  pars: number[];
  players: InRoundPlayer[];
  // The signed-in user's matchPlayerId, if they're playing (vs. just
  // watching). Null = read-only viewer.
  myMatchPlayerId: string | null;
  // GROSS / NET / CUSTOM. Drives the small meta line under the course
  // name (NET vs GROSS label) and the hero card's net stat.
  scoringMode: "GROSS" | "NET" | "CUSTOM";
  // Side-game running totals — last row of each series carries the
  // cumulative figure at the latest played hole. Optional: if a game
  // isn't enabled, the tab simply doesn't render.
  sideGames: {
    skins?: SideGameRow[];
    nassauTotal?: SideGameRow[];
    stableford?: SideGameRow[];
  };
  // Whether the user can log scores (creator + seated players).
  canLogScores: boolean;
  // Tee-to-green yardage per absolute hole number. Drives the "388y"
  // tag on the hero card's HOLE row. Missing keys = no yardage tag
  // for that hole.
  yardageByHole?: Record<number, number | null>;
};

const COACHMARK_KEY = "sticks.coachmark.scorecard.dismissed";

export default function InRoundLive({
  matchId,
  courseName,
  holes,
  startingHole,
  pars,
  players,
  myMatchPlayerId,
  scoringMode,
  sideGames,
  canLogScores,
  yardageByHole,
}: InRoundProps) {
  // The "current hole" is the lowest hole nobody (including you) has
  // logged yet. If everyone is fully scored, anchor on the last hole.
  const currentHole = useMemo(() => {
    const lastHole = startingHole + holes - 1;
    for (let h = startingHole; h <= lastHole; h++) {
      const anyMissing = players.some((p) => p.scoresByHole[h] == null);
      if (anyMissing) return h;
    }
    return lastHole;
  }, [players, startingHole, holes]);

  const me = useMemo(
    () => players.find((p) => p.id === myMatchPlayerId) ?? null,
    [players, myMatchPlayerId],
  );

  // My gross / net / position.
  const heroStats = useMemo(
    () => computeHeroStats(me, players, pars, startingHole, scoringMode),
    [me, players, pars, startingHole, scoringMode],
  );

  // Coachmark gate: render the tooltip pointing at the active scorecard
  // cell once per device, dismissed on tap of "Got it" or any cell.
  const [showCoach, setShowCoach] = useState(false);
  useEffect(() => {
    if (!canLogScores) return;
    try {
      const dismissed = localStorage.getItem(COACHMARK_KEY) === "1";
      if (!dismissed) setShowCoach(true);
    } catch {
      // private mode -- behave as dismissed.
    }
  }, [canLogScores]);
  const dismissCoach = () => {
    setShowCoach(false);
    try {
      localStorage.setItem(COACHMARK_KEY, "1");
    } catch {}
  };

  // Picker modal target: which player + hole the user is logging
  // a score for. null = closed. Tapping a cell opens; the chip grid
  // commits and closes in one tap.
  const [pickerTarget, setPickerTarget] = useState<{
    player: InRoundPlayer;
    hole: number;
  } | null>(null);

  // Standings switcher state.
  type Tab = "live" | "skins" | "nassau" | "stbl";
  const availableTabs: Tab[] = ["live"];
  if (sideGames.skins) availableTabs.push("skins");
  if (sideGames.nassauTotal) availableTabs.push("nassau");
  if (sideGames.stableford) availableTabs.push("stbl");
  const [tab, setTab] = useState<Tab>("live");
  if (!availableTabs.includes(tab)) {
    // The set of enabled side games can change between renders (e.g.
    // creator just disabled one). Snap back to Live so we never sit
    // on an empty tab.
    setTab("live");
  }

  return (
    <div className="space-y-3">
      <Hero
        toPar={heroStats.toParGross}
        netToPar={heroStats.toParNet}
        holesThru={heroStats.holesThru}
        position={heroStats.position}
        positionOf={players.length}
        scoringMode={scoringMode}
        currentHole={currentHole}
        currentPar={pars[currentHole - startingHole] ?? 4}
        currentYardage={yardageByHole?.[currentHole] ?? null}
        front9ToPar={heroStats.front9ToPar}
        back9ToPar={heroStats.back9ToPar}
        showBack9={holes > 9}
      />
      <ScorecardGrid
        matchId={matchId}
        currentHole={currentHole}
        startingHole={startingHole}
        holes={holes}
        pars={pars}
        players={players}
        myMatchPlayerId={myMatchPlayerId}
        canLogScores={canLogScores}
        showCoach={showCoach}
        onDismissCoach={dismissCoach}
        onPickCell={(player, hole) => {
          dismissCoach();
          setPickerTarget({ player, hole });
        }}
      />
      <StandingsCard
        tab={tab}
        availableTabs={availableTabs}
        onTab={setTab}
        players={players}
        myMatchPlayerId={myMatchPlayerId}
        sideGames={sideGames}
        currentHole={currentHole}
        startingHole={startingHole}
        pars={pars}
      />
      <ScorePicker
        target={pickerTarget}
        matchId={matchId}
        startingHole={startingHole}
        pars={pars}
        onClose={() => setPickerTarget(null)}
        onAdvance={(fromPlayer, hole) => {
          // Move to the next player on the SAME hole who still has no
          // score. Used by BOTH save and skip so the foursome can be
          // ripped through ("5, tap; skip; 4, tap; ...") without
          // re-tapping cells. Cycle follows seat order; if everyone
          // else already has a score, close.
          const idx = players.findIndex((p) => p.id === fromPlayer.id);
          const ordered = [
            ...players.slice(idx + 1),
            ...players.slice(0, idx),
          ];
          const next = ordered.find(
            (p) => p.id !== fromPlayer.id && p.scoresByHole[hole] == null,
          );
          if (next) {
            setPickerTarget({ player: next, hole });
          } else {
            setPickerTarget(null);
          }
        }}
      />
    </div>
  );
}

// ===== Hero ==========================================================

function Hero({
  toPar,
  netToPar,
  holesThru,
  position,
  positionOf,
  scoringMode,
  currentHole,
  currentPar,
  currentYardage,
  front9ToPar,
  back9ToPar,
  showBack9,
}: {
  toPar: number | null;
  netToPar: number | null;
  holesThru: number;
  position: number | null;
  positionOf: number;
  scoringMode: "GROSS" | "NET" | "CUSTOM";
  currentHole: number;
  currentPar: number;
  currentYardage: number | null;
  front9ToPar: number | null;
  back9ToPar: number | null;
  showBack9: boolean;
}) {
  return (
    <section className="card p-[15px_18px] flex items-center gap-4">
      <div className="flex flex-col items-center gap-1 pr-4 border-r border-border">
        <div
          className={
            "font-display font-bold tabular-nums leading-[0.78] " +
            (toPar != null && toPar < 0 ? "text-accent" : "text-ink")
          }
          style={{ fontSize: 56 }}
        >
          {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`}
        </div>
        <div className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-mute font-semibold whitespace-nowrap">
          Gross · thru {holesThru}
        </div>
      </div>
      {/* Right pane: two aligned stat columns (NET/POSITION on the
          left, FRONT 9/BACK 9 on the right), then the current-hole
          detail on its own line at the bottom so the par + yardage
          never wrap into the stat rows. */}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="flex gap-4">
          <div className="flex-1 flex flex-col gap-1.5 min-w-0 pr-3">
            {scoringMode !== "GROSS" && (
              <HeroStat
                label="Net"
                value={formatToPar(netToPar)}
                accent={netToPar != null && netToPar < 0}
              />
            )}
            <HeroStat
              label="Position"
              value={
                position == null
                  ? "—"
                  : (
                      <>
                        {position}
                        <small className="font-mono text-[10.5px] text-mute ml-px">
                          {ordinalSuffix(position)}
                        </small>
                      </>
                    )
              }
            />
          </div>
          <div className="flex-1 flex flex-col gap-1.5 min-w-0 pl-3">
            <HeroStat
              label="Front 9"
              value={formatToPar(front9ToPar)}
              accent={front9ToPar != null && front9ToPar < 0}
            />
            {showBack9 && (
              <HeroStat
                label="Back 9"
                value={formatToPar(back9ToPar)}
                accent={back9ToPar != null && back9ToPar < 0}
              />
            )}
          </div>
        </div>
        <div className="pt-2 border-t border-border font-mono text-[10.5px] tracking-[0.08em] uppercase text-mute font-semibold flex items-center gap-1.5">
          <span className="text-ink font-bold tabular-nums normal-case">
            Hole {currentHole}
          </span>
          <span className="text-faint">·</span>
          <span>Par {currentPar}</span>
          {currentYardage != null && (
            <>
              <span className="text-faint">·</span>
              <span className="tabular-nums">{currentYardage}y</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function formatToPar(v: number | null): string {
  if (v == null) return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : `${v}`;
}

function HeroStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2.5">
      <span className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-mute font-semibold">
        {label}
      </span>
      <span
        className={
          "font-display font-bold text-[17px] leading-none tabular-nums " +
          (accent ? "text-accent" : "text-ink")
        }
      >
        {value}
      </span>
    </div>
  );
}

// ===== Scorecard grid ================================================

function ScorecardGrid({
  matchId,
  currentHole,
  startingHole,
  holes,
  pars,
  players,
  myMatchPlayerId,
  canLogScores,
  showCoach,
  onDismissCoach,
  onPickCell,
}: {
  matchId: string;
  currentHole: number;
  startingHole: number;
  holes: number;
  pars: number[];
  players: InRoundPlayer[];
  myMatchPlayerId: string | null;
  canLogScores: boolean;
  showCoach: boolean;
  onDismissCoach: () => void;
  onPickCell: (player: InRoundPlayer, hole: number) => void;
}) {
  // Every hole, rendered in a horizontally scrollable strip. The
  // player-name column stays pinned on the left; the current hole is
  // auto-centered on mount + whenever it advances.
  const lastHole = startingHole + holes - 1;
  const allHoles = Array.from({ length: holes }, (_, i) => startingHole + i);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[data-cur="1"]');
    if (el) {
      el.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [currentHole]);

  // Which nine the current hole sits on (Front / Back / Solo nine).
  const frontEnd = startingHole + Math.min(9, holes) - 1;
  const onFront = currentHole <= frontEnd;
  const halfLabel = holes <= 9 ? "" : onFront ? "FRONT" : "BACK";

  // Aggregate the user's running to-par through the LAST played hole.
  const me = players.find((p) => p.id === myMatchPlayerId) ?? null;
  const thru = (() => {
    if (!me) return 0;
    let last = 0;
    for (let h = startingHole; h <= lastHole; h++) {
      if (me.scoresByHole[h] != null) last = h - startingHole + 1;
    }
    return last;
  })();
  const meToPar = (() => {
    if (!me) return null;
    let total = 0;
    let any = false;
    for (let h = startingHole; h <= lastHole; h++) {
      const s = me.scoresByHole[h];
      if (s == null) continue;
      any = true;
      total += s - (pars[h - startingHole] ?? 4);
    }
    return any ? total : null;
  })();

  return (
    <section className="card p-[13px_6px_14px] relative">
      <div className="flex items-center justify-between px-[11px] mb-2.5">
        <h2 className="font-display text-[13px] font-bold text-ink">
          Scorecard
        </h2>
        <div className="font-mono text-[10px] tracking-[0.05em] uppercase text-mute font-semibold">
          {halfLabel && `${halfLabel} · `}
          <span className={meToPar != null && meToPar < 0 ? "text-accent font-bold" : "text-accent font-bold"}>
            {meToPar == null
              ? `thru ${thru}`
              : meToPar === 0
                ? `E thru ${thru}`
                : meToPar > 0
                  ? `+${meToPar} thru ${thru}`
                  : `${meToPar} thru ${thru}`}
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="overflow-x-auto no-scrollbar px-[5px]"
      >
        <div
          className="grid gap-[5px_3px] items-center"
          style={{
            gridTemplateColumns: `84px repeat(${allHoles.length}, 44px)`,
          }}
        >
          <div className="sticky left-0 z-[2] bg-panel pr-1">
            <span className="font-mono text-[8px] tracking-[0.08em] uppercase text-faint font-semibold">
              Hole
            </span>
          </div>
          {allHoles.map((h) => {
            const par = pars[h - startingHole] ?? 4;
            const isCur = h === currentHole;
            return (
              <div
                key={`head-${h}`}
                data-cur={isCur ? 1 : undefined}
                className={
                  "flex flex-col items-center gap-px pb-px pt-[3px] " +
                  (isCur ? "rounded-t-[8px] bg-accent/[0.07]" : "")
                }
              >
                <span
                  className={
                    "font-mono text-[9px] leading-none font-semibold " +
                    (isCur ? "text-accent" : "text-faint")
                  }
                >
                  {h}
                </span>
                <span className="font-mono text-[8px] leading-none text-faint">
                  P{par}
                </span>
              </div>
            );
          })}

          {players.map((p) => (
            <ScorecardRow
              key={p.id}
              player={p}
              currentHole={currentHole}
              windowHoles={allHoles}
              startingHole={startingHole}
              pars={pars}
              canLogScores={canLogScores}
              onPick={onPickCell}
            />
          ))}
        </div>
      </div>

      {showCoach && (
        // Hangs OFF the bottom of the card with the arrow pointing UP
        // at the active column. Spec puts it below so the cells stay
        // unobstructed.
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 rounded-[10px] px-3 py-2 text-[11px] font-sans font-semibold text-center w-[180px] shadow-[0_12px_26px_-12px_rgba(0,0,0,0.55)]"
          style={{
            background: "rgb(var(--color-accent))",
            color: "rgb(var(--ink-on-accent))",
            bottom: "-46px",
          }}
        >
          <span
            aria-hidden
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 rounded-[2px]"
            style={{ background: "rgb(var(--color-accent))" }}
          />
          Tap any cell to enter a score
          <button
            type="button"
            onClick={onDismissCoach}
            className="block w-full mt-1 font-mono text-[8px] tracking-[0.08em] uppercase opacity-70 active:opacity-100"
          >
            Got it
          </button>
        </div>
      )}
    </section>
  );
}

function ScorecardRow({
  player,
  currentHole,
  windowHoles,
  startingHole,
  pars,
  canLogScores,
  onPick,
}: {
  player: InRoundPlayer;
  currentHole: number;
  windowHoles: number[];
  startingHole: number;
  pars: number[];
  canLogScores: boolean;
  onPick: (player: InRoundPlayer, hole: number) => void;
}) {
  const onTap = (hole: number) => {
    if (!canLogScores) return;
    onPick(player, hole);
  };

  return (
    <>
      <div className="sticky left-0 z-[2] bg-panel flex items-center gap-1.5 min-w-0 pl-1 pr-1.5">
        <PlayerBubble player={player} size={14} />
        <span className="font-sans text-[12px] text-ink font-semibold truncate">
          {player.displayName}
        </span>
      </div>
      {windowHoles.map((h) => {
        const par = pars[h - startingHole] ?? 4;
        const score = player.scoresByHole[h];
        const isCur = h === currentHole;
        const rel = score != null ? score - par : null;
        const isPlayed = score != null;
        const isFuture = h > currentHole;

        const baseCls =
          "h-[30px] rounded-[8px] grid place-items-center font-display font-bold text-[13px] leading-none tabular-nums transition-colors ";
        // Variant styling
        let style: React.CSSProperties = {};
        let inner: React.ReactNode = "";
        let extraCls = "";
        if (isPlayed && !isCur) {
          if (rel! < 0) {
            extraCls = "text-accent";
            style = {
              background: "rgb(var(--color-accent) / 0.10)",
              border: "1px solid rgb(var(--color-accent) / 0.4)",
            };
          } else if (rel! > 0) {
            extraCls = "text-danger";
            style = {
              background: "rgb(var(--color-danger) / 0.08)",
              border: "1px solid rgb(var(--color-danger) / 0.4)",
            };
          } else {
            extraCls = "text-ink";
            style = {
              background: "rgb(var(--color-panel2))",
              border: "1px solid rgb(var(--color-border))",
            };
          }
          inner = score;
        } else if (isCur) {
          // Active column treatment. If the player has a score, show
          // it inside a forest ring; otherwise show the "+" affordance
          // so the empty active cell reads as "tap me".
          if (isPlayed) {
            extraCls = "text-accent";
            style = {
              background: "rgb(var(--color-bg))",
              border: "1.5px solid rgb(var(--color-accent))",
            };
            inner = score;
          } else {
            extraCls = "text-accent font-sans text-[16px]";
            style = {
              background: "rgb(var(--color-bg))",
              border: "1.5px dashed rgb(var(--color-accent) / 0.55)",
            };
            inner = "+";
          }
        } else if (isFuture) {
          extraCls = "text-faint";
          style = {
            border: "1px dashed rgb(var(--color-border))",
            background: "transparent",
          };
        } else {
          // Past hole, unscored
          extraCls = "text-faint";
          style = {
            border: "1px dashed rgb(var(--color-border))",
            background: "transparent",
          };
        }

        return (
          <button
            key={`${player.id}-${h}`}
            type="button"
            onClick={() => onTap(h)}
            disabled={!canLogScores}
            className={
              baseCls +
              extraCls +
              (isCur ? " bg-accent/[0.07]" : "") +
              (!canLogScores ? " cursor-default" : " active:scale-95")
            }
            style={style}
            aria-label={
              isPlayed
                ? `${player.displayName} scored ${score} on hole ${h}`
                : `Enter ${player.displayName}'s score for hole ${h}`
            }
          >
            {inner}
          </button>
        );
      })}
    </>
  );
}

// ===== Standings switcher ============================================

function StandingsCard({
  tab,
  availableTabs,
  onTab,
  players,
  myMatchPlayerId,
  sideGames,
  currentHole,
  startingHole,
  pars,
}: {
  tab: "live" | "skins" | "nassau" | "stbl";
  availableTabs: Array<"live" | "skins" | "nassau" | "stbl">;
  onTab: (t: "live" | "skins" | "nassau" | "stbl") => void;
  players: InRoundPlayer[];
  myMatchPlayerId: string | null;
  sideGames: {
    skins?: SideGameRow[];
    nassauTotal?: SideGameRow[];
    stableford?: SideGameRow[];
  };
  currentHole: number;
  startingHole: number;
  pars: number[];
}) {
  const leader = useMemo(() => {
    if (tab !== "live") return null;
    // Lead = highest win probability.
    let best: InRoundPlayer | null = null;
    for (const p of players) {
      if (!best || p.probability > best.probability) best = p;
    }
    return best;
  }, [players, tab]);

  // Compute rows for the current tab. Each row has the player meta
  // plus the tab-specific value (win-%, skins won, nassau dollars,
  // stableford points). Pre-sort high to low.
  const rows = useMemo(() => {
    return players
      .map((p) => {
        const sideValueFor = (
          rowsArr: SideGameRow[] | undefined,
        ): number | null => {
          if (!rowsArr || rowsArr.length === 0) return null;
          // Find the latest row at or before the current hole.
          for (let i = rowsArr.length - 1; i >= 0; i--) {
            const r = rowsArr[i];
            if (r.hole <= currentHole) return Number(r[p.id] ?? 0);
          }
          return Number(rowsArr[0][p.id] ?? 0);
        };
        return {
          player: p,
          live: p.probability,
          skins: sideValueFor(sideGames.skins),
          nassau: sideValueFor(sideGames.nassauTotal),
          stbl: sideValueFor(sideGames.stableford),
        };
      })
      .sort((a, b) => {
        if (tab === "live") return b.live - a.live;
        if (tab === "skins") return (b.skins ?? 0) - (a.skins ?? 0);
        if (tab === "nassau") return (b.nassau ?? 0) - (a.nassau ?? 0);
        return (b.stbl ?? 0) - (a.stbl ?? 0);
      });
  }, [players, tab, sideGames, currentHole]);

  return (
    <section className="card p-[14px_16px]">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="font-display text-[13px] font-bold text-ink">
          Standings
        </h2>
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.08em] uppercase font-semibold text-accent"
          aria-label="Live market repricing indicator"
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-accent"
            style={{ animation: "lp 2.2s ease-out infinite" }}
          />
          Repricing
        </span>
      </div>
      {/* Segmented control only renders when there's something to
          switch BETWEEN. A single "Live" pill looking like a tab when
          there are no side games reads as a stranded button -- just
          hide it. With side games present, "Live" becomes "Overall"
          to read as the umbrella view across all games. */}
      {availableTabs.length > 1 && (
        <div className="flex gap-[3px] p-[3px] rounded-[10px] bg-panel2 border border-border mb-2.5">
          {(["live", "skins", "nassau", "stbl"] as const)
            .filter((t) => availableTabs.includes(t))
            .map((t) => {
              const on = t === tab;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTab(t)}
                  className={
                    "flex-1 text-center py-[7px] rounded-[7px] font-mono text-[10px] tracking-[0.02em] font-semibold transition-colors whitespace-nowrap " +
                    (on
                      ? "bg-accent text-ink-on-accent"
                      : "text-mute active:text-ink")
                  }
                >
                  {t === "live"
                    ? "Overall"
                    : t === "skins"
                      ? "Skins"
                      : t === "nassau"
                        ? "Nassau"
                        : "Stbl"}
                </button>
              );
            })}
        </div>
      )}
      {/* Rows */}
      <div className="flex flex-col">
        {rows.map((r, i) => {
          const isYou = r.player.id === myMatchPlayerId;
          const isLead = tab === "live" && leader && leader.id === r.player.id;
          // To-par for the row (gross, since hero already shows net).
          const toPar = computeToPar(
            r.player,
            startingHole,
            currentHole,
            pars,
          );
          const trend =
            tab === "live"
              ? r.live >= 0.4
                ? "up"
                : r.live >= 0.2
                  ? "flat"
                  : "down"
              : null;
          return (
            <StandingsRow
              key={r.player.id}
              player={r.player}
              isYou={!!isYou}
              isLead={!!isLead}
              isFirst={i === 0}
              toPar={toPar}
              tab={tab}
              live={r.live}
              skins={r.skins}
              nassau={r.nassau}
              stbl={r.stbl}
              trend={trend}
            />
          );
        })}
      </div>
    </section>
  );
}

function StandingsRow({
  player,
  isYou,
  isLead,
  isFirst,
  toPar,
  tab,
  live,
  skins,
  nassau,
  stbl,
  trend,
}: {
  player: InRoundPlayer;
  isYou: boolean;
  isLead: boolean;
  isFirst: boolean;
  toPar: number | null;
  tab: "live" | "skins" | "nassau" | "stbl";
  live: number;
  skins: number | null;
  nassau: number | null;
  stbl: number | null;
  trend: "up" | "flat" | "down" | null;
}) {
  return (
    <div
      className={
        "grid items-center gap-2 py-[7px] " +
        (isFirst ? "" : "border-t border-border ") +
        (isYou ? "-mx-4 px-4 bg-accent/[0.05]" : "")
      }
      style={
        tab === "live"
          ? { gridTemplateColumns: "18px 1fr 32px 1fr 44px 16px" }
          : { gridTemplateColumns: "18px 1fr auto 56px" }
      }
    >
      <PlayerBubble player={player} size={18} />
      <span className="min-w-0 flex items-baseline gap-1.5">
        <span className="font-sans text-[13px] font-semibold text-ink truncate">
          {player.displayName}
        </span>
        {isLead && (
          <span className="font-mono text-[8px] tracking-[0.06em] uppercase font-semibold text-gold">
            LEAD
          </span>
        )}
      </span>
      {tab === "live" ? (
        <>
          <span
            className={
              "font-display font-bold text-[13px] tabular-nums text-right " +
              (toPar == null
                ? "text-mute"
                : toPar < 0
                  ? "text-accent"
                  : toPar > 0
                    ? "text-danger"
                    : "text-mute")
            }
          >
            {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}
          </span>
          <span className="h-[7px] rounded-[4px] bg-panel2 border border-border overflow-hidden relative">
            <span
              className="absolute inset-y-0 left-0 rounded-[4px]"
              style={{
                width: `${Math.max(2, live * 100)}%`,
                background: isYou
                  ? "rgb(74 96 122)"
                  : "rgb(var(--color-accent))",
              }}
            />
          </span>
          <span className="font-display font-bold text-[12px] tabular-nums text-right text-ink">
            {Math.round(live * 100)}%
          </span>
          <span
            className={
              "font-mono text-[11px] text-right " +
              (trend === "up"
                ? "text-accent"
                : trend === "down"
                  ? "text-danger"
                  : "text-faint")
            }
          >
            {trend === "up" ? "▲" : trend === "down" ? "▼" : "—"}
          </span>
        </>
      ) : tab === "skins" ? (
        <>
          <span
            className={
              "font-display font-bold text-[13px] tabular-nums text-right " +
              (toPar == null
                ? "text-mute"
                : toPar < 0
                  ? "text-accent"
                  : toPar > 0
                    ? "text-danger"
                    : "text-mute")
            }
          >
            {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}
          </span>
          <span className="font-display font-bold text-[14px] tabular-nums text-right text-gold">
            {skins != null ? skins : "—"}
          </span>
        </>
      ) : tab === "nassau" ? (
        <>
          <span
            className={
              "font-display font-bold text-[13px] tabular-nums text-right " +
              (toPar == null
                ? "text-mute"
                : toPar < 0
                  ? "text-accent"
                  : toPar > 0
                    ? "text-danger"
                    : "text-mute")
            }
          >
            {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}
          </span>
          <span
            className={
              "font-display font-bold text-[13px] tabular-nums text-right " +
              (nassau == null
                ? "text-mute"
                : nassau > 0
                  ? "text-accent"
                  : nassau < 0
                    ? "text-danger"
                    : "text-mute")
            }
          >
            {nassau == null
              ? "—"
              : nassau === 0
                ? "$0"
                : nassau > 0
                  ? `+$${nassau}`
                  : `-$${Math.abs(nassau)}`}
          </span>
        </>
      ) : (
        <>
          <span
            className={
              "font-display font-bold text-[13px] tabular-nums text-right " +
              (toPar == null
                ? "text-mute"
                : toPar < 0
                  ? "text-accent"
                  : toPar > 0
                    ? "text-danger"
                    : "text-mute")
            }
          >
            {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}
          </span>
          <span className="font-display font-bold text-[13px] tabular-nums text-right text-ink">
            {stbl != null ? stbl : "—"}
          </span>
        </>
      )}
    </div>
  );
}

// ===== Helpers =======================================================

function computeHeroStats(
  me: InRoundPlayer | null,
  players: InRoundPlayer[],
  pars: number[],
  startingHole: number,
  scoringMode: "GROSS" | "NET" | "CUSTOM",
) {
  if (!me) {
    return {
      toParGross: null,
      toParNet: null,
      holesThru: 0,
      position: null,
      front9ToPar: null,
      back9ToPar: null,
    };
  }
  let total = 0;
  let played = 0;
  let any = false;
  let front = 0;
  let frontAny = false;
  let back = 0;
  let backAny = false;
  const lastHole = startingHole + pars.length - 1;
  // The "front 9" is the first 9 holes of THIS round -- so for a
  // back-9 match (startingHole=10) hole 10 still counts as the front.
  for (let h = startingHole; h <= lastHole; h++) {
    const s = me.scoresByHole[h];
    if (s == null) continue;
    any = true;
    const rel = s - (pars[h - startingHole] ?? 4);
    total += rel;
    played++;
    const idx = h - startingHole;
    if (idx < 9) {
      front += rel;
      frontAny = true;
    } else {
      back += rel;
      backAny = true;
    }
  }
  const toParGross = any ? total : null;
  const toParNet =
    scoringMode === "GROSS" || !any || me.handicap == null
      ? null
      : Math.round((total - me.handicap * (played / pars.length)) * 10) / 10;
  const front9ToPar = frontAny ? front : null;
  const back9ToPar = backAny ? back : null;

  // Position: rank players by their netScore (if available) ascending
  // (lowest net = best). Falls back to to-par from raw scores.
  const ranked = players
    .map((p) => ({
      id: p.id,
      score:
        p.netScore != null
          ? p.netScore
          : (() => {
              let t = 0;
              let n = 0;
              for (let h = startingHole; h <= lastHole; h++) {
                const s = p.scoresByHole[h];
                if (s == null) continue;
                t += s - (pars[h - startingHole] ?? 4);
                n++;
              }
              return n > 0 ? t : 999;
            })(),
    }))
    .sort((a, b) => a.score - b.score);
  const idx = ranked.findIndex((r) => r.id === me.id);
  const position = idx >= 0 ? idx + 1 : null;

  return {
    toParGross,
    toParNet,
    holesThru: played,
    position,
    front9ToPar,
    back9ToPar,
  };
}

function computeToPar(
  player: InRoundPlayer,
  startingHole: number,
  currentHole: number,
  pars: number[],
): number | null {
  let total = 0;
  let any = false;
  for (let h = startingHole; h <= currentHole; h++) {
    const s = player.scoresByHole[h];
    if (s == null) continue;
    any = true;
    total += s - (pars[h - startingHole] ?? 4);
  }
  return any ? total : null;
}

// ===== Score picker modal ============================================
//
// Slides up from the bottom with a par-tinted chip row. One tap on a
// chip saves the score and closes -- no keyboard needed (was a
// window.prompt that defaulted to a text input on iOS).

function ScorePicker({
  target,
  matchId,
  startingHole,
  pars,
  onClose,
  onAdvance,
}: {
  target: { player: InRoundPlayer; hole: number } | null;
  matchId: string;
  startingHole: number;
  pars: number[];
  onClose: () => void;
  // Advance to the next player on the same hole. Fires after a save
  // OR when the user skips (doesn't know / doesn't want to enter a
  // score). The parent finds the next unscored player or closes.
  onAdvance: (player: InRoundPlayer, hole: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  if (!target) return null;
  const { player, hole } = target;
  const par = pars[hole - startingHole] ?? 4;
  const current = player.scoresByHole[hole] ?? null;

  // Chip range: par-2 (eagle) through par+5 (snowman). Clamped at 1
  // so par-3 holes don't show a "0".
  const choices: number[] = [];
  for (let s = Math.max(1, par - 2); s <= par + 5; s++) choices.push(s);

  const save = (strokes: number) => {
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("matchPlayerId", player.id);
    fd.set("hole", String(hole));
    fd.set("strokes", String(strokes));
    startTransition(async () => {
      await logScoreAction(fd);
      onAdvance(player, hole);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Log score for ${player.displayName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-bg border-t border-border rounded-t-2xl p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <PlayerBubble player={player} size={20} />
            <div className="min-w-0">
              <div className="font-display font-semibold text-[14px] text-ink truncate">
                {player.displayName}
              </div>
              <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-mute">
                Hole {hole} · Par {par}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-mute active:text-ink"
          >
            Cancel
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {choices.map((s) => {
            const rel = s - par;
            const isCurrent = s === current;
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => save(s)}
                className={
                  "h-14 rounded-[12px] flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95 disabled:opacity-60 " +
                  scoreChipCls(rel, isCurrent)
                }
              >
                <span className="font-display font-bold text-[20px] leading-none tabular-nums">
                  {s}
                </span>
                <span className="font-mono text-[8px] tracking-[0.06em] uppercase opacity-70">
                  {scoreLabel(rel)}
                </span>
              </button>
            );
          })}
        </div>
        {/* Skip: move to the next player on this hole without logging
            a score (don't know it / not entering it). */}
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(player, hole)}
          className="w-full mt-2.5 py-2.5 rounded-[12px] border border-border bg-panel2 text-mute font-mono text-[11px] tracking-[0.12em] uppercase font-semibold active:text-ink disabled:opacity-60"
        >
          Skip · next player →
        </button>
      </div>
    </div>
  );
}

function scoreChipCls(rel: number, selected: boolean): string {
  if (selected) {
    return "bg-accent text-ink-on-accent border border-transparent shadow-[0_8px_20px_-6px_rgb(var(--color-accent)/0.5)]";
  }
  if (rel <= -2) return "bg-gold/10 border border-gold/40 text-gold";
  if (rel === -1) return "bg-accent/10 border border-accent/35 text-accent";
  if (rel === 0) return "bg-panel border border-border text-ink";
  if (rel === 1) return "bg-panel border border-border text-mute";
  return "bg-panel border border-border text-danger";
}

function scoreLabel(rel: number): string {
  if (rel <= -3) return "Albatross";
  if (rel === -2) return "Eagle";
  if (rel === -1) return "Birdie";
  if (rel === 0) return "Par";
  if (rel === 1) return "Bogey";
  if (rel === 2) return "Double";
  if (rel === 3) return "Triple";
  return `+${rel}`;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
