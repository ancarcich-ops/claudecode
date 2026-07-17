"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { registerForBirdieBoysAction } from "@/lib/actions";

type State = { error: string } | { ok: true } | undefined;

export default function BirdieBoysRegisterForm({
  loggedIn,
  username,
  rosterNames,
  registeredCount,
  joined,
  initialHandicap,
  initialPartner,
  tournamentId,
}: {
  loggedIn: boolean;
  username: string | null;
  rosterNames: string[];
  registeredCount: number;
  joined: boolean;
  initialHandicap: number | null;
  initialPartner: string | null;
  tournamentId: string | null;
}) {
  const [state, formAction] = useFormState<State, FormData>(
    registerForBirdieBoysAction,
    undefined,
  );
  // Already registered -> show the confirmation, with an editable form
  // tucked behind "Update my details".
  const [editing, setEditing] = useState(false);

  const err = state && "error" in state ? state.error : null;

  if (joined && !editing) {
    return (
      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-ink-on-accent text-[13px] font-bold"
            aria-hidden
          >
            ✓
          </span>
          <h2 className="font-display text-xl font-semibold text-ink">
            You&rsquo;re in!
          </h2>
        </div>
        <p className="mt-2 text-sm text-mute">
          You&rsquo;re registered for the Birdie Boys 2nd Annual
          {username ? (
            <>
              {" "}
              as <span className="text-ink font-medium">@{username}</span>
            </>
          ) : null}
          .
        </p>
        <dl className="mt-4 space-y-1.5 text-sm">
          <Row label="Handicap">
            {initialHandicap != null ? initialHandicap : "—"}
          </Row>
          <Row label="Partner">{initialPartner || "Not set yet"}</Row>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-ghost text-sm"
          >
            Update my details
          </button>
          {tournamentId && (
            <Link
              href={`/tournaments/${tournamentId}`}
              className="btn btn-primary text-sm"
            >
              View the tournament →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold text-ink">
        {joined
          ? "Update your registration"
          : loggedIn
            ? "Join the tournament"
            : "Sign up & claim your spot"}
      </h2>
      <p className="mt-1 text-sm text-mute">
        {joined
          ? "Change your handicap or partner below."
          : loggedIn
            ? `Signed in as @${username}. Enter your handicap and partner to register.`
            : "Create your free Sticks account — you'll be entered in the tournament automatically."}
        {!joined && registeredCount > 0 && (
          <>
            {" "}
            <span className="text-ink font-medium">
              {registeredCount} player{registeredCount === 1 ? "" : "s"}
            </span>{" "}
            signed up so far.
          </>
        )}
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        {/* New-account fields only when signed out. */}
        {!loggedIn && (
          <>
            <Field label="Username">
              <input
                name="username"
                required
                autoComplete="username"
                pattern="[-A-Za-z0-9._]+"
                minLength={2}
                maxLength={20}
                placeholder="e.g. big_peas"
                className={inputCls}
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={inputCls}
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className={inputCls}
              />
            </Field>
          </>
        )}

        <Field label="Handicap" hint="Optional — you can update it later">
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

        <Field label="Playing partner" hint="Optional — leave blank if you don't have one yet">
          <input
            name="partnerName"
            list="birdie-partners"
            maxLength={60}
            defaultValue={initialPartner ?? ""}
            placeholder="Your 2-man best ball partner"
            className={inputCls}
          />
          <datalist id="birdie-partners">
            {rosterNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>

        {err && (
          <p className="text-sm text-danger" role="alert">
            {err}
          </p>
        )}

        <SubmitButton
          label={
            joined
              ? "Save changes"
              : loggedIn
                ? "Join the tournament"
                : "Create account & join"
          }
        />

        {joined && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="w-full text-center text-xs text-mute hover:text-ink"
          >
            Cancel
          </button>
        )}

        {!loggedIn && (
          <p className="text-center text-xs text-mute">
            Already have an account?{" "}
            <Link
              href="/login?next=/birdie-boys"
              className="text-accent hover:underline"
            >
              Sign in to join
            </Link>
          </p>
        )}
      </form>
    </div>
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
      <span className="mb-1.5 flex items-baseline justify-between">
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

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full disabled:opacity-60"
    >
      {pending ? "One sec…" : label}
    </button>
  );
}
