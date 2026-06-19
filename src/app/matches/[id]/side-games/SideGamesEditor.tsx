"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  ALL_SIDE_GAMES,
  type SideGameKind,
  type SkinsPushRule,
  type WolfPushRule,
} from "@/lib/sideGames";

// Slim editor reachable from the scorecard CTA. Covers add/remove of
// the common side games plus their inline config (push rules, target
// counts, sixes stake). Course / players / format aren't editable
// here -- this is intentionally the safe-mid-round subset.

type TargetsStat = "PAR_OR_BETTER" | "BIRDIE_OR_BETTER";

export type SideGamesEditorProps = {
  matchId: string;
  holes: number;
  playerCount: number;
  format: "INDIVIDUAL" | "SCRAMBLE";
  matchStatus: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  hasTeamVsTeam: boolean;
  initial: {
    sideGames: SideGameKind[];
    skinsPushRule: SkinsPushRule;
    wolfPushRule: WolfPushRule;
    targetsStat: TargetsStat;
    targetsTarget: string;
    targetsAnte: string;
    sixesStake: string;
  };
};

export default function SideGamesEditor({
  matchId,
  holes,
  playerCount,
  format,
  matchStatus,
  hasTeamVsTeam,
  initial,
}: SideGamesEditorProps) {
  const [sideGames, setSideGames] = useState<Set<SideGameKind>>(
    () => new Set(initial.sideGames),
  );
  const [skinsPushRule, setSkinsPushRule] = useState<SkinsPushRule>(
    initial.skinsPushRule,
  );
  const [wolfPushRule, setWolfPushRule] = useState<WolfPushRule>(
    initial.wolfPushRule,
  );
  const [targetsStat, setTargetsStat] = useState<TargetsStat>(
    initial.targetsStat,
  );
  const [targetsTarget, setTargetsTarget] = useState(initial.targetsTarget);
  const [targetsAnte, setTargetsAnte] = useState(initial.targetsAnte);
  const [sixesStake, setSixesStake] = useState(initial.sixesStake);

  function toggle(kind: SideGameKind) {
    setSideGames((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const skinsConfigJson = JSON.stringify({ pushRule: skinsPushRule });
  const wolfConfigJson = JSON.stringify({ pushRule: wolfPushRule });
  const targetsTargetNum = Number(targetsTarget);
  const targetsAnteNum = Number(targetsAnte);
  const targetsConfigJson = JSON.stringify({
    stat: targetsStat,
    target: Number.isFinite(targetsTargetNum) ? Math.max(1, Math.floor(targetsTargetNum)) : 10,
    ...(Number.isFinite(targetsAnteNum) && targetsAnteNum > 0
      ? { ante: targetsAnteNum }
      : {}),
  });
  const sixesStakeNum = Number(sixesStake);
  const sixesConfigJson = JSON.stringify({
    ...(Number.isFinite(sixesStakeNum) && sixesStakeNum > 0
      ? { stake: sixesStakeNum }
      : {}),
  });

  return (
    <>
      <input type="hidden" name="matchId" value={matchId} />
      {sideGames.has("SKINS") && (
        <input type="hidden" name="skinsConfig" value={skinsConfigJson} />
      )}
      {sideGames.has("WOLF") && (
        <input type="hidden" name="wolfConfig" value={wolfConfigJson} />
      )}
      {sideGames.has("TARGETS") && (
        <input type="hidden" name="targetsConfig" value={targetsConfigJson} />
      )}
      {sideGames.has("SIXES") && (
        <input type="hidden" name="sixesConfig" value={sixesConfigJson} />
      )}

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">
            Side games
          </h2>
          <span className="text-[11px] text-mute">{sideGames.size} on</span>
        </div>
        {matchStatus === "IN_PROGRESS" && (
          <p className="text-[11px] text-mute leading-snug">
            Round&apos;s underway. You can add or remove side games here &mdash;
            scores recompute from the strokes already logged.
          </p>
        )}

        {hasTeamVsTeam && (
          <div className="rounded-md border border-border bg-panel2/40 px-3 py-2 text-[11px] text-mute">
            Team vs Team is on for this match (set via the round&apos;s format).
            Edit it from the{" "}
            <Link
              href={`/matches/${matchId}/edit?step=side-games`}
              className="text-accent hover:underline"
            >
              full match editor
            </Link>{" "}
            when the round hasn&apos;t started yet.
          </div>
        )}

        <div className="space-y-2">
          {ALL_SIDE_GAMES.filter((g) => {
            if (g.kind === "TEAM_VS_TEAM") return false;
            if (format === "SCRAMBLE" && g.kind !== "SNAKE") return false;
            return true;
          }).map((g) => {
            const disabledByHoles = g.requires18 && holes !== 18;
            const disabledByPlayers =
              g.requires4Players && playerCount !== 4;
            const disabled = disabledByHoles || disabledByPlayers;
            const active = sideGames.has(g.kind);
            const disabledReason = disabledByHoles
              ? "Needs 18 holes"
              : disabledByPlayers
                ? "Needs exactly 4 players"
                : null;
            return (
              <div key={g.kind}>
                <label
                  className={
                    "flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors " +
                    (disabled
                      ? "border-border opacity-50 cursor-not-allowed"
                      : active
                        ? "border-accent/50 bg-accent/5"
                        : "border-border hover:border-accent/30")
                  }
                >
                  <input
                    type="checkbox"
                    name="sideGame"
                    value={g.kind}
                    checked={active && !disabled}
                    onChange={() => !disabled && toggle(g.kind)}
                    disabled={disabled}
                    className="mt-0.5 shrink-0 accent-accent"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{g.label}</div>
                    <div className="text-[11px] text-mute">
                      {disabledReason ?? g.blurb}
                    </div>
                  </div>
                </label>
                {g.kind === "SKINS" && active && !disabled && (
                  <PushRulePicker
                    title="On tied holes"
                    value={skinsPushRule}
                    options={[
                      {
                        value: "CARRYOVER",
                        label: "Carry over",
                        help: "Skin rolls to the next hole.",
                      },
                      {
                        value: "NO_CARRY",
                        label: "No carry",
                        help: "Tied hole pays nothing; reset to 1.",
                      },
                    ]}
                    onChange={(v) => setSkinsPushRule(v as SkinsPushRule)}
                  />
                )}
                {g.kind === "WOLF" && active && !disabled && (
                  <PushRulePicker
                    title="On tied / pushed holes"
                    value={wolfPushRule}
                    options={[
                      {
                        value: "NO_POINTS",
                        label: "No points",
                        help: "Push pays nothing, reset to 1x.",
                      },
                      {
                        value: "ROLLOVER",
                        label: "Roll over",
                        help: "Push raises multiplier; next hole pays double.",
                      },
                    ]}
                    onChange={(v) => setWolfPushRule(v as WolfPushRule)}
                  />
                )}
                {g.kind === "TARGETS" && active && !disabled && (
                  <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-mute">
                      Target stat
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["PAR_OR_BETTER", "Pars +"],
                          ["BIRDIE_OR_BETTER", "Birdies"],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setTargetsStat(val)}
                          className={
                            "rounded-md border px-2 py-1.5 text-[12px] " +
                            (targetsStat === val
                              ? "border-accent bg-accent/10 text-ink"
                              : "border-border text-mute hover:text-ink")
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center justify-between text-[12px] gap-3">
                      <span className="text-mute">Target count</span>
                      <input
                        type="number"
                        min={1}
                        value={targetsTarget}
                        onChange={(e) => setTargetsTarget(e.target.value)}
                        className="input w-20 text-right"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[12px] gap-3">
                      <span className="text-mute">Ante ($, optional)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={targetsAnte}
                        onChange={(e) => setTargetsAnte(e.target.value)}
                        className="input w-20 text-right"
                      />
                    </label>
                  </div>
                )}
                {g.kind === "SIXES" && active && !disabled && (
                  <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2">
                    <label className="flex items-center justify-between text-[12px] gap-3">
                      <span className="text-mute">Stake per dot ($)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={sixesStake}
                        onChange={(e) => setSixesStake(e.target.value)}
                        className="input w-24 text-right"
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <SaveButton />
        <Link href={`/matches/${matchId}`} className="btn btn-ghost text-sm">
          Cancel
        </Link>
      </div>
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-sm">
      {pending ? "Saving…" : "Save side games"}
    </button>
  );
}

function PushRulePicker({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: { value: string; label: string; help: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-mute">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((o) => {
          const isActive = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={
                "rounded-md border px-2 py-1.5 text-left " +
                (isActive
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-border text-mute hover:text-ink")
              }
              aria-pressed={isActive}
            >
              <div className="text-[12px] font-medium">{o.label}</div>
              <div className="text-[10px] leading-snug text-mute mt-0.5">
                {o.help}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
