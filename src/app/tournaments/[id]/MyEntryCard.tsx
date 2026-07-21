"use client";

import { useState, useTransition } from "react";
import { updateMyTournamentEntryAction } from "@/lib/actions";

// A rostered player's own entry on the tournament page: shows their
// handicap + teammate request with an inline editor. Players can update
// these themselves without going back to the sign-up link. The actual
// team pairing stays organizer-controlled -- this only edits the request.
export default function MyEntryCard({
  tournamentId,
  initialHandicap,
  initialPartner,
  rosterNames,
}: {
  tournamentId: string;
  initialHandicap: number | null;
  initialPartner: string | null;
  rosterNames: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateMyTournamentEntryAction(fd);
      setEditing(false);
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-display text-base font-semibold text-ink">
          Your entry
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-ghost text-xs"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="space-y-1.5 text-sm">
          <Row label="Handicap">
            {initialHandicap != null ? initialHandicap : "Not set"}
          </Row>
          <Row label="Teammate request">
            {initialPartner || "None yet"}
          </Row>
        </dl>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Handicap" hint="Optional">
            <input
              name="handicap"
              type="number"
              step="0.1"
              min="-10"
              max="54"
              inputMode="decimal"
              defaultValue={initialHandicap ?? ""}
              placeholder="e.g. 12.4"
              className={inputCls}
            />
          </Field>

          <Field
            label="Teammate request"
            hint="Who you'd like to pair with — the organizer sets final teams"
          >
            <input
              name="partnerName"
              list="my-entry-partners"
              maxLength={60}
              defaultValue={initialPartner ?? ""}
              placeholder="Your 2-man best ball partner"
              className={inputCls}
            />
            <datalist id="my-entry-partners">
              {rosterNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>

          <input type="hidden" name="tournamentId" value={tournamentId} />

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary text-sm disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="btn btn-ghost text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-[11px] border border-border bg-panel2 px-3.5 py-3 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute">
          {label}
        </span>
        {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border pb-1.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
        {label}
      </dt>
      <dd className="text-ink font-medium">{children}</dd>
    </div>
  );
}
