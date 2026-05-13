"use client";

import { useMemo, useState } from "react";
import type { CoursePreset } from "@/lib/courses";

type PlayerRow = { name: string; handicap: string };

export default function NewMatchForm({
  action,
  defaultPlayerName,
  recentCourses,
  presets,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultPlayerName: string;
  recentCourses: string[];
  presets: CoursePreset[];
}) {
  const [players, setPlayers] = useState<PlayerRow[]>([
    { name: defaultPlayerName, handicap: "12" },
    { name: "", handicap: "15" },
  ]);
  const [courseName, setCourseName] = useState("");
  const [holes, setHoles] = useState<9 | 18>(18);

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
    setPlayers((rows) => [...rows, { name: "", handicap: "18" }]);
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
            <div className="mt-2 flex items-center justify-between text-xs rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
              <div className="text-mute">
                <span className="text-accent font-medium">
                  {matchedPreset.name}
                </span>{" "}
                · {matchedPreset.city} · {matchedPreset.region} ·{" "}
                <span className="text-ink">
                  par {matchedPreset.pars.reduce((a, b) => a + b, 0)}
                </span>{" "}
                · {matchedPreset.holes}H · {matchedPreset.access}
              </div>
              <span className="chip">pars autofilled</span>
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
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                name="playerName"
                value={p.name}
                onChange={(e) => setPlayer(i, { name: e.target.value })}
                placeholder={`Player ${i + 1}`}
                className="input col-span-7"
                maxLength={32}
                required
              />
              <input
                name="playerHandicap"
                type="number"
                step="0.1"
                value={p.handicap}
                onChange={(e) => setPlayer(i, { handicap: e.target.value })}
                placeholder="Handicap"
                className="input col-span-3"
                required
              />
              <button
                type="button"
                className="btn btn-ghost col-span-2"
                onClick={() => removePlayer(i)}
                disabled={players.length <= 2}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-mute mt-3">
          Lower handicap = market favorite at open. Crowd wagers and live
          scoring shift the line from there.
        </p>
      </div>

      {parsToSubmit && (
        <input
          type="hidden"
          name="parData"
          value={JSON.stringify(parsToSubmit)}
        />
      )}

      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit">
          Open market
        </button>
      </div>
    </form>
  );
}
