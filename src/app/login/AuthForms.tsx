"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  signInAction,
  signUpAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/lib/actions";

type AuthState = { error: string } | { ok: true } | undefined;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full disabled:opacity-60"
    >
      {pending ? "…" : label}
    </button>
  );
}

function ErrorNote({ state }: { state: AuthState }) {
  if (!state || !("error" in state)) return null;
  return (
    <p className="text-[13px] text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
      {state.error}
    </p>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useFormState<AuthState, FormData>(
    signInAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="identifier">
          Username or email
        </label>
        <input
          id="identifier"
          name="identifier"
          className="input"
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
      </div>
      <ErrorNote state={state} />
      <SubmitButton label="Sign in" />
      <div className="flex items-center justify-between text-[12px] text-mute pt-1">
        <Link href="/forgot-password" className="underline hover:text-ink">
          Forgot password?
        </Link>
        <Link href="/signup" className="underline hover:text-ink">
          Create account
        </Link>
      </div>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useFormState<AuthState, FormData>(
    signUpAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          className="input"
          placeholder="bryson.d"
          autoComplete="username"
          autoFocus
          required
          minLength={2}
          maxLength={20}
          pattern="[A-Za-z0-9._-]+"
        />
        <p className="text-[11px] text-mute mt-1">
          Letters, numbers, dots, underscores, hyphens.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-[11px] text-mute mt-1">At least 8 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="displayName">
          Display name{" "}
          <span className="text-mute normal-case">(optional)</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          className="input"
          placeholder="Bryson"
          maxLength={40}
        />
      </div>
      <ErrorNote state={state} />
      <SubmitButton label="Create account" />
      <p className="text-[12px] text-mute pt-1">
        Already have an account?{" "}
        <Link href="/login" className="underline hover:text-ink">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState<AuthState, FormData>(
    requestPasswordResetAction,
    undefined,
  );
  // On success the action returns { ok: true } -- swap the form for a
  // neutral confirmation that doesn't reveal whether the email exists.
  if (state && "ok" in state) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink">
          If an account exists for that email, a reset link is on its way.
          Check your inbox (and spam) — the link expires in 1 hour.
        </p>
        <p className="text-[12px] text-mute">
          <Link href="/login" className="underline hover:text-ink">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-mute">
        Enter your email and we&apos;ll send a link to reset your password.
      </p>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          autoFocus
          required
        />
      </div>
      <ErrorNote state={state} />
      <SubmitButton label="Send reset link" />
      <p className="text-[12px] text-mute pt-1">
        <Link href="/login" className="underline hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState<AuthState, FormData>(
    resetPasswordAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          autoFocus
          required
          minLength={8}
        />
        <p className="text-[11px] text-mute mt-1">At least 8 characters.</p>
      </div>
      <ErrorNote state={state} />
      <SubmitButton label="Set new password" />
    </form>
  );
}
