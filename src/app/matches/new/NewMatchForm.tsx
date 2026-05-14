"use client";

import { useMemo, useState } from "react";
import type { CoursePreset } from "@/lib/courses";
import PlayerNameInput from "@/components/PlayerNameInput";

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

export default function NewMatchForm({
  action,
  defaultPlayerName,
  currentUserId,
  recentCourses,
  presets,
  groups,
  defaultGroupId,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultPlayerName: string;
  currentUserId: string;
  recentCourses: string[];
  presets: CoursePreset[];
  groups: { id: string; name: string }[];
  defaultGroupId: string;
}) {
  const [players, setPlayers] = useState<PlayerRow[]>([
    { name: defaultPlayerName, handicap: "12", userId: currentUserId },
    { name: "", handicap: "15", userId: null },
  ]);
  const [courseName, setCourseName] = useState("");
  const [holes, setHoles] = useState<9 | 18>(18);
  const [scoringMode, setScoringMode] = useState<ScoringMode>("NET");
  const modeCopy = MODE_COPY[scoringMode];

  const presetByName = useMemo(() => {
    const m = new Map<string, CoursePreset>();
    for (const p of presets) m.set(p.name.toLowerCase(), p);
    return m;
  }, [presets]);

  const matchedPreset = presetByName.get(courseName.trim().toLowerCase());

  // Pars used for the hidden parData field. Preset takes priority; manual
  // input (or "no preset matched") sends empty so the server falls back to
  // its standard default for the chosen hole count.
  const parsToSubmit =
    matchedPreset && matchedPreset.holes === holes ? matchedPreset.pars : null;

  const onCourseChange = (value: string) => {
    setCourseName(value);
    const preset = presetByName.get(value.trim().toLowerCase());
    if (preset) {
      setHoles(preset.holes);
    }
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
      rows.length > 2 ? rows.filter((_, idx) => idx !== i) : rows,
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

  // Group presets by region for the datalist (LA first, then OC).
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

  return (
    <form action={action} className="space-y-5">
      <div className="card p-5 space-y-4">
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
            required
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

        <div className="grid grid-cols-2 gap-3">
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
              required
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
              onChange={(e) => setHoles(Number(e.target.value) as 9 | 18)}
            >
              <option value="18">18</option>
              <option value="9">9</option>
            </select>
          </div>
        </div>
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

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wider text-mute">
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
                required
              />
              <button
                type="button"
                className="btn btn-ghost px-2 shrink-0"
                onClick={() => removePlayer(i)}
                disabled={players.length <= 2}
                aria-label={`Remove player ${i + 1}`}
                title="Remove player"
              >
                <RemoveIcon />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-mute mt-3">
          Crowd wagers and live scoring shift the line from there.
        </p>
      </div>

      {parsToSubmit && (
        <input
          type="hidden"
          name="parData"
          value={JSON.stringify(parsToSubmit)}
        />
      )}

      <div className="flex sm:justify-end">
        <button
          className="btn btn-primary w-full sm:w-auto"
          type="submit"
        >
          Open market
        </button>
      </div>
    </form>
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
