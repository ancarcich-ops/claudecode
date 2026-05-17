"use client";

import { useMemo, useState } from "react";
import type { CoursePreset } from "@/lib/courses";
import PlayerNameInput from "@/components/PlayerNameInput";
import {
  ALL_SIDE_GAMES,
  COMING_SOON_SIDE_GAMES,
  type SideGameKind,
} from "@/lib/sideGames";

type PlayerRow = { name: string; handicap: string; userId: string | null };
type ScoringMode = "NET" | "GROSS" | "CUSTOM";

const MODE_COPY: Record<
  ScoringMode,
  { label: string; sub: string; field: string; help: string }
> = {
  NET: {
    label: "Net",
    sub: "Handicap",
    field: "Hcp",
    help: "Lowest gross minus handicap wins. Lower handicap is the market favorite at open.",
  },
  GROSS: {
    label: "Gross",
    sub: "Straight up",
    field: "Hcp",
    help: "Lowest raw score wins. Handicaps are informational only.",
  },
  CUSTOM: {
    label: "Custom",
    sub: "Group strokes",
    field: "Strokes",
    help: "Group sets the stroke allowance per player. Lowest gross minus strokes wins.",
  },
};

const STEPS = [
  { key: "round", title: "Round" },
  { key: "players", title: "Players" },
  { key: "extras", title: "Side games" },
] as const;

export default function NewMatchForm({
  action,
  defaultPlayerName,
  defaultPlayerHandicap = "12",
  currentUserId,
  recentCourses,
  presets,
  groups,
  defaultGroupId,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultPlayerName: string;
  // Pre-filled handicap for the creator's seat. Comes from their computed
  // Sticks index when available; the parent supplies the fallback string.
  defaultPlayerHandicap?: string;
  currentUserId: string;
  recentCourses: string[];
  presets: CoursePreset[];
  groups: { id: string; name: string }[];
  defaultGroupId: string;
}) {
  const [step, setStep] = useState(0);
  const [players, setPlayers] = useState<PlayerRow[]>([
    {
      name: defaultPlayerName,
      handicap: defaultPlayerHandicap,
      userId: currentUserId,
    },
    { name: "", handicap: "15", userId: null },
  ]);
  const [sideGames, setSideGames] = useState<Set<SideGameKind>>(new Set());

  const toggleSideGame = (kind: SideGameKind) =>
    setSideGames((curr) => {
      const next = new Set(curr);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const [courseName, setCourseName] = useState("");
  const [holes, setHoles] = useState<9 | 18>(18);
  // 1 = full or front 9, 10 = back 9. Only meaningful when holes === 9.
  const [startingHole, setStartingHole] = useState<1 | 10>(1);
  const [scoringMode, setScoringMode] = useState<ScoringMode>("NET");
  const modeCopy = MODE_COPY[scoringMode];

  const presetByName = useMemo(() => {
    const m = new Map<string, CoursePreset>();
    for (const p of presets) m.set(p.name.toLowerCase(), p);
    return m;
  }, [presets]);

  const matchedPreset = presetByName.get(courseName.trim().toLowerCase());

  const parsToSubmit = (() => {
    if (!matchedPreset) return null;
    if (matchedPreset.holes === holes) return matchedPreset.pars;
    if (matchedPreset.holes === 18 && holes === 9) {
      return startingHole === 10
        ? matchedPreset.pars.slice(9, 18)
        : matchedPreset.pars.slice(0, 9);
    }
    return null;
  })();

  const onCourseChange = (value: string) => {
    setCourseName(value);
    const preset = presetByName.get(value.trim().toLowerCase());
    if (preset) {
      setHoles(preset.holes);
      if (preset.holes === 18) setStartingHole(1);
    }
  };

  const onHolesChange = (value: 9 | 18) => {
    setHoles(value);
    if (value === 18) setStartingHole(1);
  };

  const setPlayer = (i: number, patch: Partial<PlayerRow>) =>
    setPlayers((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );

  const addPlayer = () =>
    players.length < 6 &&
    setPlayers((rows) => [
      ...rows,
      { name: "", handicap: "18", userId: null },
    ]);
  const removePlayer = (i: number) =>
    setPlayers((rows) =>
      rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows,
    );

  const defaultTee = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 0);
    if (d.getMinutes() === 0) d.setHours(d.getHours() + 1);
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`;
  })();

  const groupedPresets = useMemo(() => {
    const byRegion = new Map<string, CoursePreset[]>();
    for (const p of presets) {
      const arr = byRegion.get(p.region) ?? [];
      arr.push(p);
      byRegion.set(p.region, arr);
    }
    for (const arr of byRegion.values())
      arr.sort((a, b) => a.name.localeCompare(b.name));
    return byRegion;
  }, [presets]);

  // Per-step validation. The Next button is disabled when the current
  // step has unfilled / invalid data. The final step always validates
  // (the side-game step is optional input only).
  const canAdvance = (() => {
    if (step === 0) return courseName.trim().length > 0;
    if (step === 1) {
      return players.every(
        (p) => p.name.trim().length > 0 && !Number.isNaN(parseFloat(p.handicap)),
      );
    }
    return true;
  })();

  const tryNext = () => {
    if (!canAdvance) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <form
      action={action}
      className="space-y-4"
      onSubmit={(e) => {
        // Belt-and-suspenders: even if a stray Enter / replay-click on
        // the sticky CTA tries to fire submit before the user has
        // reached the final step, swallow it. The "Open market" button
        // (rendered only on the last step) is the only legitimate path.
        if (step !== STEPS.length - 1) {
          e.preventDefault();
        }
      }}
    >
      {/* Step header: progress dots + back arrow + step title. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className={
            "text-mute hover:text-ink text-sm w-10 " +
            (step === 0 ? "invisible" : "")
          }
          aria-label="Previous step"
        >
          ←
        </button>
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === step
                  ? "w-6 bg-accent"
                  : i < step
                    ? "w-1.5 bg-accent/60"
                    : "w-1.5 bg-border")
              }
            />
          ))}
        </div>
        <span className="w-10 text-right text-[10px] uppercase tracking-wider text-mute">
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <div className="text-center">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {STEPS[step].title}
        </h2>
      </div>

      {/* Step 1: Course + tee + scoring + visibility + notes */}
      <div hidden={step !== 0} className="card p-5 space-y-4">
        <div>
          <label className="label" htmlFor="courseName">
            Course
          </label>
          <input
            id="courseName"
            name="courseName"
            className="input"
            placeholder="Start typing - Riviera, Pelican Hill, Rancho Park..."
            value={courseName}
            onChange={(e) => onCourseChange(e.target.value)}
            list="course-presets"
            autoComplete="off"
          />
          <datalist id="course-presets">
            {recentCourses.map((c) => (
              <option key={`recent-${c}`} value={c} label="Recent" />
            ))}
            {Array.from(groupedPresets.entries()).flatMap(([region, list]) =>
              list.map((p) => (
                <option
                  key={p.id}
                  value={p.name}
                  label={`${p.city} · ${region} · par ${p.pars.reduce(
                    (a, b) => a + b,
                    0,
                  )} · ${p.holes}H · ${p.access}`}
                />
              )),
            )}
          </datalist>

          {matchedPreset ? (
            <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
              <div className="text-mute leading-relaxed">
                <span className="text-accent font-medium">
                  {matchedPreset.name}
                </span>
                <span className="block sm:inline">
                  <span className="hidden sm:inline"> · </span>
                  {matchedPreset.city} · {matchedPreset.region} ·{" "}
                  <span className="text-ink">
                    par {matchedPreset.pars.reduce((a, b) => a + b, 0)}
                  </span>{" "}
                  · {matchedPreset.holes}H · {matchedPreset.access}
                </span>
              </div>
              <span className="chip self-start sm:self-auto shrink-0">
                pars autofilled
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-mute mt-1">
              Pick from {presets.length} SoCal courses, or type any name.
              Hole pars autofill when you match a preset (always editable
              later).
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="scheduledAt">
              Tee time
            </label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              className="input"
              defaultValue={defaultTee}
            />
          </div>
          <div>
            <label className="label" htmlFor="holes">
              Holes
            </label>
            <select
              id="holes"
              name="holes"
              className="input"
              value={holes}
              onChange={(e) => onHolesChange(Number(e.target.value) as 9 | 18)}
            >
              <option value="18">18</option>
              <option value="9">9</option>
            </select>
          </div>
        </div>
        {holes === 9 && (
          <div>
            <label className="label">Which nine</label>
            <input
              type="hidden"
              name="startingHole"
              value={startingHole}
            />
            <div className="grid grid-cols-2 gap-2">
              {([1, 10] as const).map((n) => {
                const active = startingHole === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStartingHole(n)}
                    className={
                      "flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 transition min-h-[3.25rem] " +
                      (active
                        ? "border-accent bg-accent/10 text-ink"
                        : "border-border text-mute hover:text-ink")
                    }
                    aria-pressed={active}
                  >
                    <span className="text-sm font-medium leading-none">
                      {n === 1 ? "Front 9" : "Back 9"}
                    </span>
                    <span className="text-[10px] leading-none opacity-70">
                      {n === 1 ? "Holes 1-9" : "Holes 10-18"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <label className="label">Scoring</label>
          <input type="hidden" name="scoringMode" value={scoringMode} />
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODE_COPY) as ScoringMode[]).map((m) => {
              const active = scoringMode === m;
              const c = MODE_COPY[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setScoringMode(m)}
                  className={
                    "flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 transition min-h-[3.25rem] " +
                    (active
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-border text-mute hover:text-ink")
                  }
                  aria-pressed={active}
                >
                  <span className="text-sm font-medium leading-none">
                    {c.label}
                  </span>
                  <span className="text-[10px] leading-none opacity-70">
                    {c.sub}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-mute mt-1.5">{modeCopy.help}</p>
        </div>
        <div>
          <label className="label" htmlFor="groupId">
            Visible to
          </label>
          <select
            id="groupId"
            name="groupId"
            className="input"
            defaultValue={defaultGroupId}
          >
            <option value="public">Public - anyone signed in</option>
            {groups.length > 0 && (
              <optgroup label="My groups">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} (members only)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {groups.length === 0 && (
            <p className="text-[11px] text-mute mt-1">
              Want a private round?{" "}
              <a className="text-accent" href="/groups">
                Create a group →
              </a>
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="notes">
            Notes <span className="text-mute normal-case">(optional)</span>
          </label>
          <input
            id="notes"
            name="notes"
            className="input"
            placeholder="Skins game, $5 closeouts, etc."
          />
        </div>
      </div>

      {/* Step 2: Players */}
      <div hidden={step !== 1} className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold text-ink">
            Players
          </h2>
          <button
            type="button"
            onClick={addPlayer}
            className="btn btn-ghost text-xs"
            disabled={players.length >= 6}
          >
            + Add player
          </button>
        </div>
        <div className="space-y-2">
          {players.map((p, i) => (
            <div key={i} className="flex gap-2 items-start">
              <PlayerNameInput
                value={p.name}
                userId={p.userId}
                onChange={(next) =>
                  setPlayer(i, { name: next.name, userId: next.userId })
                }
                placeholder={`Player ${i + 1}`}
              />
              <input
                name="playerHandicap"
                type="number"
                step="0.1"
                value={p.handicap}
                onChange={(e) => setPlayer(i, { handicap: e.target.value })}
                placeholder={modeCopy.field}
                title={modeCopy.field}
                aria-label={modeCopy.field}
                className="input w-20 shrink-0 text-center px-2"
              />
              <button
                type="button"
                className="btn btn-ghost px-2 shrink-0"
                onClick={() => removePlayer(i)}
                disabled={players.length <= 1}
                aria-label={`Remove player ${i + 1}`}
                title="Remove player"
              >
                <RemoveIcon />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-mute mt-3">
          Crowd wagers and live scoring shift the line from there. Playing
          solo is fine — drop everyone else to log just your round.
        </p>
      </div>

      {/* Step 3: Side games + review */}
      <div hidden={step !== 2} className="space-y-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-base font-semibold text-ink">
              Side games
            </h2>
            <span className="text-[11px] text-mute">{sideGames.size} on</span>
          </div>
          <p className="text-[11px] text-mute mb-3">
            Track extra games alongside the main{" "}
            {modeCopy.label.toLowerCase()} match. Leaderboards update live as
            scores come in.
          </p>
          <div className="space-y-2">
            {ALL_SIDE_GAMES.map((g) => {
              const disabledByHoles = g.requires18 && holes !== 18;
              const active = sideGames.has(g.kind);
              return (
                <label
                  key={g.kind}
                  className={
                    "flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors " +
                    (disabledByHoles
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
                    checked={active && !disabledByHoles}
                    onChange={() =>
                      !disabledByHoles && toggleSideGame(g.kind)
                    }
                    disabled={disabledByHoles}
                    className="mt-0.5 shrink-0 accent-accent"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{g.label}</div>
                    <div className="text-[11px] text-mute">
                      {disabledByHoles ? "Needs 18 holes" : g.blurb}
                    </div>
                  </div>
                </label>
              );
            })}
            {COMING_SOON_SIDE_GAMES.map((g) => (
              <div
                key={g.kind}
                className="flex items-start gap-3 rounded-md border border-border px-3 py-2 opacity-50"
              >
                <input
                  type="checkbox"
                  disabled
                  className="mt-0.5 shrink-0"
                  aria-label={`${g.label} (coming soon)`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center justify-between gap-2">
                    <span>{g.label}</span>
                    <span className="chip text-[10px]">Coming soon</span>
                  </div>
                  <div className="text-[11px] text-mute">{g.blurb}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <ReviewCard
          courseName={courseName}
          holes={holes}
          startingHole={startingHole}
          scoringMode={scoringMode}
          playerCount={players.filter((p) => p.name.trim()).length}
          sideGameCount={sideGames.size}
        />
      </div>

      {parsToSubmit && (
        <input
          type="hidden"
          name="parData"
          value={JSON.stringify(parsToSubmit)}
        />
      )}

      {/* Sticky bottom action. Next while we're on steps 1 & 2; submit
          on the final step. Distinct `key`s + `type=button` on Next make
          sure a stray replayed click can't morph into a form submit. */}
      <div className="sticky bottom-2 pt-2">
        {step < STEPS.length - 1 ? (
          <button
            key="next"
            type="button"
            onClick={tryNext}
            disabled={!canAdvance}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {step === 0 && !canAdvance
              ? "Add a course to continue"
              : step === 1 && !canAdvance
                ? "Fill in every player to continue"
                : "Next →"}
          </button>
        ) : (
          <button
            key="submit"
            type="submit"
            className="btn btn-primary w-full"
          >
            Open market
          </button>
        )}
      </div>
    </form>
  );
}

function ReviewCard({
  courseName,
  holes,
  startingHole,
  scoringMode,
  playerCount,
  sideGameCount,
}: {
  courseName: string;
  holes: 9 | 18;
  startingHole: 1 | 10;
  scoringMode: ScoringMode;
  playerCount: number;
  sideGameCount: number;
}) {
  const ninesLabel =
    holes === 18 ? "18" : startingHole === 10 ? "Back 9" : "Front 9";
  return (
    <div className="card p-5">
      <h2 className="font-display text-base font-semibold text-ink mb-2">
        Review
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-mute">Course</dt>
        <dd className="text-ink truncate text-right">
          {courseName || <span className="text-faint">—</span>}
        </dd>
        <dt className="text-mute">Holes</dt>
        <dd className="text-ink text-right">{ninesLabel}</dd>
        <dt className="text-mute">Scoring</dt>
        <dd className="text-ink text-right">{MODE_COPY[scoringMode].label}</dd>
        <dt className="text-mute">Players</dt>
        <dd className="text-ink text-right">{playerCount}</dd>
        <dt className="text-mute">Side games</dt>
        <dd className="text-ink text-right">
          {sideGameCount === 0 ? "None" : sideGameCount}
        </dd>
      </dl>
    </div>
  );
}

function RemoveIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
