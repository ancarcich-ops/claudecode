"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type ScoringMode = "NET" | "GROSS";

export default function NewTournamentForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [scoringMode, setScoringMode] = useState<ScoringMode>("NET");
  const [roundsPlanned, setRoundsPlanned] = useState(3);

  // Defaults the start picker to "now + 1 day" rounded to the hour.
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
            per-round results in these units.
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
                setRoundsPlanned(
                  Math.max(1, Math.min(12, Number(e.target.value))),
                )
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

        <p className="text-[11px] text-mute leading-snug">
          You&apos;ll get an invite code on the next screen. Share it with
          anyone you want to join the tournament &mdash; they don&apos;t need
          to be in your group.
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
      {pending
        ? "Creating…"
        : disabled
          ? "Name the tournament to continue"
          : "Create tournament →"}
    </button>
  );
}
