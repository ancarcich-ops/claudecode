"use client";

import { useState } from "react";

type PlayerRow = { name: string; handicap: string };

export default function NewMatchForm({
  action,
  defaultUsername,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultUsername: string;
}) {
  const [players, setPlayers] = useState<PlayerRow[]>([
    { name: defaultUsername, handicap: "12" },
    { name: "", handicap: "15" },
  ]);

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

  // Local default tee time: now + 1 day, rounded to next 30 mins.
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
            placeholder="Pebble Beach Golf Links"
            required
          />
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
            <select id="holes" name="holes" className="input" defaultValue="18">
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
          Lower handicap = market favorite at open. Crowd wagers shift the line
          from there.
        </p>
      </div>

      <div className="flex justify-end">
        <button className="btn btn-primary" type="submit">
          Open market
        </button>
      </div>
    </form>
  );
}
