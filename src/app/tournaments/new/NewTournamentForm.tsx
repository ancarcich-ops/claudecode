"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import PlayerNameInput from "@/components/PlayerNameInput";

type ScoringMode = "NET" | "GROSS";
type PlayerRow = {
  name: string;
  handicap: string;
  userId: string | null;
};

export default function NewTournamentForm({
  action,
  defaultPlayerName,
  currentUserId,
  groups,
  defaultGroupId,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultPlayerName: string;
  currentUserId: string;
  groups: { id: string; name: string }[];
  defaultGroupId: string;
}) {
  const [name, setName] = useState("");
  const [scoringMode, setScoringMode] = useState<ScoringMode>("NET");
  const [roundsPlanned, setRoundsPlanned] = useState(3);
  const [players, setPlayers] = useState<PlayerRow[]>([
    { name: defaultPlayerName, handicap: "", userId: currentUserId },
    { name: "", handicap: "", userId: null },
  ]);

  const setPlayer = (i: number, patch: Partial<PlayerRow>) =>
    setPlayers((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  const addPlayer = () =>
    players.length < 24 &&
    setPlayers((rows) => [
      ...rows,
      { name: "", handicap: "", userId: null },
    ]);
  const removePlayer = (i: number) =>
    setPlayers((rows) =>
      rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows,
    );

  // Defaults the start picker to "now + 1 day" rounded to the hour.
  // Same format the new-match form uses.
  const defaultStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`;
  })();

  return (
    <form action={action} className="space-y-5">
      <div className="card p-5 space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Tournament name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            placeholder="Spring Invitational, Sunday Stroke, ..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </div>

        <div>
          <label className="label">Tournament scoring</label>
          <input type="hidden" name="scoringMode" value={scoringMode} />
          <div className="grid grid-cols-2 gap-2">
            {(["NET", "GROSS"] as const).map((m) => {
              const active = scoringMode === m;
              const label = m === "NET" ? "Net" : "Gross";
              const sub =
                m === "NET" ? "Sum of handicap nets" : "Sum of raw strokes";
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
                    {label}
                  </span>
                  <span className="text-[10px] leading-none opacity-70">
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-mute mt-1.5">
            Same mode applies to every round; the leaderboard rolls up the
            per-round results in this units.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="roundsPlanned">
              Rounds
            </label>
            <input
              id="roundsPlanned"
              name="roundsPlanned"
              type="number"
              min={1}
              max={12}
              step={1}
              value={roundsPlanned}
              onChange={(e) =>
                setRoundsPlanned(Math.max(1, Math.min(12, Number(e.target.value))))
              }
              className="input"
            />
            <p className="text-[11px] text-mute mt-1">
              Soft target. Add more later as needed.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="scheduledStartAt">
              First tee off
            </label>
            <input
              id="scheduledStartAt"
              name="scheduledStartAt"
              type="datetime-local"
              className="input"
              defaultValue={defaultStart}
            />
            <p className="text-[11px] text-mute mt-1">
              Optional. Just for the schedule label.
            </p>
          </div>
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
            <option value="public">Public — anyone signed in</option>
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
        </div>

        <div>
          <label className="label" htmlFor="notes">
            Notes <span className="text-mute normal-case">(optional)</span>
          </label>
          <input
            id="notes"
            name="notes"
            className="input"
            placeholder="2-day shotgun, $20 buy-in, ..."
            maxLength={120}
          />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              Roster
            </h2>
            <p className="text-[11px] text-mute mt-0.5">
              These names land in every round&apos;s match. Optional handicap
              per player gets snapshot for the leaderboard.
            </p>
          </div>
          <button
            type="button"
            onClick={addPlayer}
            disabled={players.length >= 24}
            className="btn btn-ghost text-xs shrink-0"
          >
            + Add player
          </button>
        </div>
        <div className="flex items-baseline gap-2 mb-1.5 px-1">
          <div className="flex-1" />
          <div className="w-20 shrink-0 text-center">
            <span className="text-[10px] uppercase tracking-wider text-mute font-mono whitespace-nowrap">
              Handicap
            </span>
          </div>
          <div className="w-8 shrink-0" />
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
                min={0}
                value={p.handicap}
                onChange={(e) => setPlayer(i, { handicap: e.target.value })}
                placeholder="Hcp"
                className="input w-20 shrink-0 text-center px-2"
              />
              <button
                type="button"
                className="btn btn-ghost px-2 shrink-0"
                onClick={() => removePlayer(i)}
                disabled={players.length <= 1}
                aria-label={`Remove player ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-mute mt-3">
          You&apos;re already on the roster as the creator; the form just adds
          you back if you remove yourself.
        </p>
      </div>

      <div className="sticky bottom-2 pt-2">
        <SubmitButton disabled={!name.trim()} />
      </div>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Creating…" : disabled ? "Name the tournament to continue" : "Create tournament →"}
    </button>
  );
}
