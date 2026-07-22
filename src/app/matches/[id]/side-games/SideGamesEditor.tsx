"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  ALL_SIDE_GAMES,
  TEAM_VS_TEAM_RULES,
  teamVsTeamRuleBlurb,
  teamVsTeamRuleLabel,
  STABLEFORD_WHS_POINTS,
  STABLEFORD_MODIFIED_POINTS,
  type SideGameKind,
  type SkinsPushRule,
  type StablefordPoints,
  type TeamVsTeamRule,
  type WolfPushRule,
} from "@/lib/sideGames";

// Slim editor reachable from the scorecard CTA. Covers add/remove of
// the common side games plus their inline config (push rules, target
// counts, sixes stake, team-vs-team teams + rules). Course / players /
// format aren't editable here -- this is intentionally the safe-mid-
// round subset.

type TargetsStat = "PAR_OR_BETTER" | "BIRDIE_OR_BETTER";

export type PlayerSeat = {
  id: string;
  displayName: string;
  team: 0 | 1;
};

export type SideGamesEditorProps = {
  matchId: string;
  holes: number;
  players: PlayerSeat[];
  format: "INDIVIDUAL" | "SCRAMBLE";
  matchStatus: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  initial: {
    sideGames: SideGameKind[];
    skinsPushRule: SkinsPushRule;
    wolfPushRule: WolfPushRule;
    targetsStat: TargetsStat;
    targetsTarget: string;
    targetsAnte: string;
    sixesStake: string;
    tvtRules: TeamVsTeamRule[];
    stablefordModified: boolean;
    stablefordPoints: StablefordPoints;
    bbbPoints: { bingo: string; bango: string; bongo: string };
    snakeStake: string;
    snakeDoubling: boolean;
    nassauAutoPress: boolean;
    nassauThreshold: string;
    nassauStake: string;
  };
};

export default function SideGamesEditor({
  matchId,
  holes,
  players: initialPlayers,
  format,
  matchStatus,
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
  const [stablefordModified, setStablefordModified] = useState(
    initial.stablefordModified,
  );
  const [stablefordPoints, setStablefordPoints] = useState<StablefordPoints>(
    initial.stablefordPoints,
  );
  const [bbbPoints, setBbbPoints] = useState(initial.bbbPoints);
  const [snakeStake, setSnakeStake] = useState(initial.snakeStake);
  const [snakeDoubling, setSnakeDoubling] = useState(initial.snakeDoubling);
  const [nassauAutoPress, setNassauAutoPress] = useState(
    initial.nassauAutoPress,
  );
  const [nassauThreshold, setNassauThreshold] = useState(
    initial.nassauThreshold,
  );
  const [nassauStake, setNassauStake] = useState(initial.nassauStake);
  const [tvtRules, setTvtRules] = useState<Set<TeamVsTeamRule>>(
    () =>
      new Set(
        initial.tvtRules.length > 0 ? initial.tvtRules : ["BEST_BALL"],
      ),
  );
  // Per-seat team assignment for TVT. SCRAMBLE keeps its own team
  // column on the player rows, so this editor doesn't touch teams
  // there -- only INDIVIDUAL+TVT uses these chips.
  const [seatTeams, setSeatTeams] = useState<(0 | 1)[]>(() =>
    initialPlayers.map((p) => p.team),
  );

  function toggle(kind: SideGameKind) {
    setSideGames((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }
  function toggleTvtRule(r: TeamVsTeamRule) {
    setTvtRules((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }
  function setSeatTeam(i: number, team: 0 | 1) {
    setSeatTeams((prev) => prev.map((t, idx) => (idx === i ? team : t)));
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
  // teams payload mirrors the new-match form: just the rules + per-
  // rule stake (no Vegas options here -- keep the slim editor focused).
  const tvtConfigJson = JSON.stringify({
    rules: Array.from(tvtRules).map((r) => ({ rule: r })),
  });
  // Stableford: only send a points table when "Modified" is chosen;
  // WHS mode leaves config empty so the default scale applies.
  const stablefordConfigJson = JSON.stringify(
    stablefordModified ? { points: stablefordPoints } : {},
  );
  const bbbNum = (s: string, fallback: number) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };
  const bbbConfigJson = JSON.stringify({
    points: {
      bingo: bbbNum(bbbPoints.bingo, 1),
      bango: bbbNum(bbbPoints.bango, 1),
      bongo: bbbNum(bbbPoints.bongo, 1),
    },
  });
  const snakeStakeNum = Number(snakeStake);
  const snakeConfigJson = JSON.stringify({
    ...(Number.isFinite(snakeStakeNum) && snakeStakeNum > 0
      ? { stake: snakeStakeNum, ...(snakeDoubling ? { doubling: true } : {}) }
      : {}),
  });
  const nassauThresholdNum = Number(nassauThreshold);
  const nassauStakeNum = Number(nassauStake);
  const nassauConfigJson = JSON.stringify({
    ...(nassauAutoPress
      ? {
          autoPress: true,
          autoPressThreshold:
            Number.isFinite(nassauThresholdNum) && nassauThresholdNum >= 1
              ? Math.floor(nassauThresholdNum)
              : 2,
        }
      : {}),
    ...(Number.isFinite(nassauStakeNum) && nassauStakeNum > 0
      ? { stake: nassauStakeNum }
      : {}),
  });
  const setStablefordPoint = (k: keyof StablefordPoints, v: string) => {
    const n = Number(v);
    setStablefordPoints((prev) => ({
      ...prev,
      [k]: Number.isFinite(n) ? Math.trunc(n) : prev[k],
    }));
  };

  const tvtActive = sideGames.has("TEAM_VS_TEAM");
  const tvtAvailable = format === "INDIVIDUAL";
  const teamACount = seatTeams.filter((t) => t === 0).length;
  const teamBCount = seatTeams.filter((t) => t === 1).length;
  const tvtNeedsTeams =
    tvtActive && tvtAvailable && (teamACount === 0 || teamBCount === 0);

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
      {sideGames.has("STABLEFORD") && (
        <input
          type="hidden"
          name="stablefordConfig"
          value={stablefordConfigJson}
        />
      )}
      {sideGames.has("BBB") && (
        <input type="hidden" name="bbbConfig" value={bbbConfigJson} />
      )}
      {sideGames.has("SNAKE") && (
        <input type="hidden" name="snakeConfig" value={snakeConfigJson} />
      )}
      {sideGames.has("NASSAU") && (
        <input type="hidden" name="nassauConfig" value={nassauConfigJson} />
      )}
      {tvtActive && tvtAvailable && (
        <>
          <input type="hidden" name="tvtConfig" value={tvtConfigJson} />
          {initialPlayers.map((p, i) => (
            <input
              key={p.id}
              type="hidden"
              name="playerTeam"
              value={String(seatTeams[i] ?? 0)}
            />
          ))}
          {initialPlayers.map((p) => (
            <input
              key={`pid-${p.id}`}
              type="hidden"
              name="playerId"
              value={p.id}
            />
          ))}
        </>
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

        <div className="space-y-2">
          {ALL_SIDE_GAMES.filter((g) => {
            // TVT only available on INDIVIDUAL matches here; SCRAMBLE
            // already plays as teams and exposes the rule picker via
            // the full edit form.
            if (g.kind === "TEAM_VS_TEAM" && !tvtAvailable) return false;
            if (format === "SCRAMBLE" && g.kind !== "SNAKE") return false;
            return true;
          }).map((g) => {
            const disabledByHoles = g.requires18 && holes !== 18;
            const disabledByPlayers =
              g.requires4Players && initialPlayers.length !== 4;
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
                {g.kind === "TEAM_VS_TEAM" && active && !disabled && (
                  <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-3 space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-mute mb-2">
                        Teams
                      </div>
                      <div className="space-y-1.5">
                        {initialPlayers.map((p, i) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-[12px] truncate">
                              {p.displayName}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {([0, 1] as const).map((t) => {
                                const isActive = seatTeams[i] === t;
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setSeatTeam(i, t)}
                                    aria-pressed={isActive}
                                    className={
                                      "h-6 px-2.5 rounded-full text-[11px] font-medium border transition " +
                                      (isActive
                                        ? "border-accent bg-accent/10 text-ink"
                                        : "border-border text-mute hover:text-ink")
                                    }
                                  >
                                    {t === 0 ? "A" : "B"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {tvtNeedsTeams && (
                        <p className="text-[11px] text-red-400 mt-2">
                          Each team needs at least one player.
                        </p>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-mute mb-2">
                        Team rules
                      </div>
                      <div className="space-y-1.5">
                        {TEAM_VS_TEAM_RULES.filter((r) => r !== "VEGAS").map(
                          (r) => {
                            const ruleActive = tvtRules.has(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => toggleTvtRule(r)}
                                aria-pressed={ruleActive}
                                className={
                                  "w-full flex items-start gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition " +
                                  (ruleActive
                                    ? "border-accent/60 bg-accent/5"
                                    : "border-border hover:border-accent/30")
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={ruleActive}
                                  readOnly
                                  className="mt-0.5 shrink-0 accent-accent pointer-events-none"
                                />
                                <span className="min-w-0">
                                  <span className="block text-[12px] font-medium">
                                    {teamVsTeamRuleLabel(r)}
                                  </span>
                                  <span className="block text-[10px] text-mute leading-tight mt-0.5">
                                    {teamVsTeamRuleBlurb(r)}
                                  </span>
                                </span>
                              </button>
                            );
                          },
                        )}
                      </div>
                      <p className="text-[10.5px] text-mute mt-2">
                        Vegas needs its own options + exactly 2v2 &mdash;
                        configure it via the full match editor before the
                        round starts.
                      </p>
                    </div>
                  </div>
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
                {g.kind === "STABLEFORD" && active && !disabled && (
                  <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-mute">
                      Scoring scale
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          [false, "Standard (WHS)", STABLEFORD_WHS_POINTS],
                          [true, "Modified", STABLEFORD_MODIFIED_POINTS],
                        ] as const
                      ).map(([mod, label, preset]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            setStablefordModified(mod);
                            // Seed the editable table from the preset the
                            // first time Modified is chosen.
                            if (mod) setStablefordPoints(preset);
                          }}
                          className={
                            "rounded-md border px-2 py-1.5 text-[12px] " +
                            (stablefordModified === mod
                              ? "border-accent bg-accent/10 text-ink"
                              : "border-border text-mute hover:text-ink")
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {stablefordModified && (
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        {(
                          [
                            ["albatross", "Albatross+"],
                            ["eagle", "Eagle"],
                            ["birdie", "Birdie"],
                            ["par", "Par"],
                            ["bogey", "Bogey"],
                            ["double", "Dbl+"],
                          ] as const
                        ).map(([k, label]) => (
                          <label key={k} className="text-[11px]">
                            <span className="block text-mute mb-0.5">
                              {label}
                            </span>
                            <input
                              type="number"
                              step="1"
                              value={String(stablefordPoints[k])}
                              onChange={(e) =>
                                setStablefordPoint(k, e.target.value)
                              }
                              className="input w-full text-right"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    <p className="text-[10.5px] text-mute">
                      {stablefordModified
                        ? "Points per result vs par; negatives allowed."
                        : "WHS: birdie 3, par 2, bogey 1, double+ 0."}
                    </p>
                  </div>
                )}
                {g.kind === "BBB" && active && !disabled && (
                  <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-mute">
                      Points per event
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          ["bingo", "Bingo"],
                          ["bango", "Bango"],
                          ["bongo", "Bongo"],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="text-[11px]">
                          <span className="block text-mute mb-0.5">{label}</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={bbbPoints[k]}
                            onChange={(e) =>
                              setBbbPoints((prev) => ({
                                ...prev,
                                [k]: e.target.value,
                              }))
                            }
                            className="input w-full text-right"
                          />
                        </label>
                      ))}
                    </div>
                    <p className="text-[10.5px] text-mute">
                      First on, closest to pin, first in the hole. Default 1
                      each.
                    </p>
                  </div>
                )}
                {g.kind === "SNAKE" && active && !disabled && (
                  <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                    <label className="flex items-center justify-between text-[12px] gap-3">
                      <span className="text-mute">Snake stake ($)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={snakeStake}
                        onChange={(e) => setSnakeStake(e.target.value)}
                        className="input w-24 text-right"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[12px] gap-3 cursor-pointer">
                      <span className="text-mute">
                        Double the pot each pass
                      </span>
                      <input
                        type="checkbox"
                        checked={snakeDoubling}
                        onChange={(e) => setSnakeDoubling(e.target.checked)}
                        className="accent-accent"
                      />
                    </label>
                    <p className="text-[10.5px] text-mute">
                      Last player to 3-putt holds the snake and owes the pot.
                    </p>
                  </div>
                )}
                {g.kind === "NASSAU" && active && !disabled && (
                  <div className="mt-2 ml-7 mr-1 rounded-md border border-border bg-panel2/40 p-2 space-y-2">
                    <label className="flex items-center justify-between text-[12px] gap-3 cursor-pointer">
                      <span className="text-mute">Auto-press when 2 down</span>
                      <input
                        type="checkbox"
                        checked={nassauAutoPress}
                        onChange={(e) => setNassauAutoPress(e.target.checked)}
                        className="accent-accent"
                      />
                    </label>
                    {nassauAutoPress && (
                      <label className="flex items-center justify-between text-[12px] gap-3">
                        <span className="text-mute">Press threshold (down)</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={nassauThreshold}
                          onChange={(e) => setNassauThreshold(e.target.value)}
                          className="input w-20 text-right"
                        />
                      </label>
                    )}
                    <label className="flex items-center justify-between text-[12px] gap-3">
                      <span className="text-mute">Stake per bet ($)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={nassauStake}
                        onChange={(e) => setNassauStake(e.target.value)}
                        className="input w-24 text-right"
                      />
                    </label>
                    <p className="text-[10.5px] text-mute">
                      Front, back &amp; total bets. Presses apply to 2-player
                      rounds.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10.5px] text-faint mt-4 rounded-md border border-border bg-panel2/40 px-2.5 py-2">
        Any dollar amounts just help Sticks tally who owes whom. Sticks only
        keeps score &mdash; no money is collected, held, or paid through the
        app. Settle up among yourselves.
      </p>

      <div className="flex items-center gap-2 mt-4">
        <SaveButton disabled={tvtNeedsTeams} />
        <Link href={`/matches/${matchId}`} className="btn btn-ghost text-sm">
          Cancel
        </Link>
      </div>
    </>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn btn-primary text-sm"
    >
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
