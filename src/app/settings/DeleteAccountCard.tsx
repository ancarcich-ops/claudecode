"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteAccountAction } from "@/lib/actions";

type State = { error: string } | { ok: true } | undefined;

// Settings "danger zone" — the in-app account deletion Apple requires.
// Two-step: reveal, then re-type the exact username to confirm before the
// destructive action is even submittable.
export default function DeleteAccountCard({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [state, formAction] = useFormState<State, FormData>(
    deleteAccountAction,
    undefined,
  );
  const err = state && "error" in state ? state.error : null;
  const matches = confirm.trim() === username;

  return (
    <section className="card p-5 border-danger/40">
      <h2 className="font-display text-base font-semibold text-danger">
        Delete account
      </h2>
      <p className="mt-1 text-sm text-mute">
        Permanently deletes your account and personal data — your profile,
        email, photo, follows and login. This can&rsquo;t be undone. Rounds
        you played stay on your friends&rsquo; scorecards, but are no longer
        linked to you.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-ghost text-danger text-sm mt-4"
        >
          Delete my account…
        </button>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-mute">
              Type your username{" "}
              <span className="text-ink">{username}</span> to confirm
            </span>
            <input
              name="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={username}
              className="w-full rounded-[11px] border border-border bg-panel2 px-3.5 py-3 text-[15px] text-ink placeholder:text-faint focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/25"
            />
          </label>

          {err && (
            <p className="text-sm text-danger" role="alert">
              {err}
            </p>
          )}

          <div className="flex items-center gap-2">
            <DeleteButton disabled={!matches} />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
              }}
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

function DeleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="btn btn-danger text-sm disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Permanently delete"}
    </button>
  );
}
