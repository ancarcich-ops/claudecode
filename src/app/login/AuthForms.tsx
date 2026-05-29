"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  signInAction,
  signUpAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/lib/actions";

// "The Clubhouse" auth visual language (from the Sticks branding kit):
// big Bricolage headings, mono uppercase field labels, 52px fields with
// an emerald focus glow, a 54px emerald primary button, and a quiet
// members-club tone. Interactive (real inputs), open signup, usernames
// kept.

type AuthState = { error: string } | { ok: true } | undefined;

// ── Field primitives ────────────────────────────────────────────────
function FieldLabel({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={
        "font-mono text-[10.5px] tracking-[0.13em] uppercase mb-2 " +
        (error ? "text-danger" : "text-faint")
      }
    >
      {children}
    </div>
  );
}

function fieldShell(error?: boolean) {
  return (
    "flex items-center gap-2.5 h-[52px] px-4 rounded-[13px] bg-panel border transition-all " +
    (error
      ? "border-danger shadow-[0_0_0_3px_rgb(248_113_113_/_0.13)]"
      : "border-border focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(52_211_153_/_0.14)]")
  );
}

const inputBase =
  "flex-1 min-w-0 bg-transparent outline-none text-[16px] text-ink placeholder:text-faint";

function TextField({
  label,
  name,
  type = "text",
  autoComplete,
  placeholder,
  autoFocus,
  required,
  error,
  pattern,
  minLength,
  maxLength,
  helper,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  error?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  helper?: string;
}) {
  return (
    <div>
      <FieldLabel error={error}>{label}</FieldLabel>
      <div className={fieldShell(error)}>
        <input
          name={name}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
          pattern={pattern}
          minLength={minLength}
          maxLength={maxLength}
          className={inputBase}
        />
      </div>
      {helper && (
        <div className="font-mono text-[11px] tracking-[0.04em] text-faint leading-snug mt-2">
          {helper}
        </div>
      )}
    </div>
  );
}

function PasswordField({
  label = "Password",
  name = "password",
  autoComplete,
  autoFocus,
  error,
  onValue,
}: {
  label?: string;
  name?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  error?: boolean;
  onValue?: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <FieldLabel error={error}>{label}</FieldLabel>
      <div className={fieldShell(error)}>
        <input
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          minLength={8}
          onChange={(e) => onValue?.(e.target.value)}
          className={inputBase + " tracking-[0.04em]"}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="shrink-0 font-mono text-[11px] tracking-[0.06em] text-mute hover:text-ink"
          tabIndex={-1}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/\d/.test(password) && /[a-zA-Z]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const labels = ["Weak", "Fair", "Good", "Strong"];
  const label = labels[Math.max(0, score - 1)];
  return (
    <div className="flex items-center gap-2.5 -mt-0.5">
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={
              "flex-1 h-[3px] rounded-[2px] " +
              (i < score ? "bg-accent" : "bg-border")
            }
          />
        ))}
      </div>
      <span className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-accent">
        {label}
      </span>
    </div>
  );
}

function PrimaryButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        "h-[54px] rounded-[14px] flex items-center justify-center gap-2.5 font-display font-semibold text-[17px] tracking-[-0.01em] transition-colors " +
        (pending
          ? "bg-panel2 text-mute border border-border cursor-default"
          : "bg-accent text-black shadow-[0_10px_28px_rgb(52_211_153_/_0.22),inset_0_1px_0_rgb(255_255_255_/_0.25)]")
      }
    >
      {pending && (
        <span className="inline-flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[5px] h-[5px] rounded-full bg-accent"
              style={{
                animation: `dotBlink 1.2s ${i * 0.2}s ease-in-out infinite`,
              }}
            />
          ))}
        </span>
      )}
      <span>{pending ? "Opening the line" : label}</span>
    </button>
  );
}

function ErrorNote({ state }: { state: AuthState }) {
  if (!state || !("error" in state)) return null;
  return (
    <div className="flex items-center gap-2 -mt-0.5 font-mono text-[11.5px] tracking-[0.03em] text-danger">
      <span className="w-3.5 h-3.5 rounded-full border border-danger text-danger inline-flex items-center justify-center text-[10px] font-bold leading-none shrink-0">
        !
      </span>
      {state.error}
    </div>
  );
}

function ForgotLink() {
  return (
    <div className="text-right -mt-1">
      <Link
        href="/forgot-password"
        className="font-mono text-[11.5px] tracking-[0.04em] text-mute hover:text-ink"
      >
        Forgot password?
      </Link>
    </div>
  );
}

function Heading({
  pill,
  title,
  sub,
}: {
  pill?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col">
      {pill && (
        <span className="inline-flex items-center gap-1.5 self-start px-2.5 py-[5px] rounded-full mb-4 bg-accent/[0.08] border border-accent/25 font-mono text-[10.5px] tracking-[0.1em] uppercase text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          {pill}
        </span>
      )}
      <h1 className="m-0 font-display font-bold text-[38px] leading-[1.0] tracking-[-0.035em] text-ink">
        {title}
      </h1>
      {sub && (
        <p className="mt-3 text-[15px] leading-[1.45] text-mute max-w-[290px]">
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Forms ────────────────────────────────────────────────────────────
export function SignInForm({ next }: { next: string }) {
  const [state, action] = useFormState<AuthState, FormData>(
    signInAction,
    undefined,
  );
  const isError = !!state && "error" in state;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Heading title="Welcome back." sub="All your games. One place." />
      <div className="h-1.5" />
      <TextField
        label="Username or email"
        name="identifier"
        autoComplete="username"
        autoFocus
        required
      />
      <PasswordField
        autoComplete="current-password"
        error={isError}
      />
      <ForgotLink />
      <ErrorNote state={state} />
      <PrimaryButton label="Sign in" />
      <SecondaryFooter lead="New here?" href="/signup" action="Create account" />
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useFormState<AuthState, FormData>(
    signUpAction,
    undefined,
  );
  const [pw, setPw] = useState("");
  const isError = !!state && "error" in state;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Heading
        title="Claim your handle."
        sub="One account for every round — make it yours."
      />
      <div className="h-1.5" />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        placeholder="bryson.d"
        autoFocus
        required
        minLength={2}
        maxLength={20}
        pattern="[A-Za-z0-9._-]+"
        helper="Letters, numbers, dots, underscores, hyphens."
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <PasswordField autoComplete="new-password" onValue={setPw} error={isError} />
      <StrengthMeter password={pw} />
      <ErrorNote state={state} />
      <PrimaryButton label="Create account" />
      <div className="font-mono text-[10px] leading-[1.6] tracking-[0.03em] text-faint text-center">
        By continuing you agree to the{" "}
        <span className="text-mute">House Rules</span> &amp;{" "}
        <span className="text-mute">Privacy</span>.
      </div>
      <SecondaryFooter
        lead="Already a member?"
        href="/login"
        action="Sign in"
      />
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState<AuthState, FormData>(
    requestPasswordResetAction,
    undefined,
  );
  if (state && "ok" in state) {
    return (
      <div className="flex flex-col gap-4">
        <Heading
          title="Check your email."
          sub="If an account exists for that email, a reset link is on its way. It expires in 1 hour."
        />
        <SecondaryFooter back href="/login" action="Back to sign in" />
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <Heading
        title="Reset your line."
        sub="We'll email a link to set a new password."
      />
      <div className="h-1.5" />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        required
      />
      <ErrorNote state={state} />
      <PrimaryButton label="Send reset link" />
      <SecondaryFooter back href="/login" action="Back to sign in" />
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState<AuthState, FormData>(
    resetPasswordAction,
    undefined,
  );
  const [pw, setPw] = useState("");
  const isError = !!state && "error" in state;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Heading
        title="Set a new password."
        sub="Pick something only you know. You'll be signed in right after."
      />
      <div className="h-1.5" />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        autoFocus
        onValue={setPw}
        error={isError}
      />
      <StrengthMeter password={pw} />
      <ErrorNote state={state} />
      <PrimaryButton label="Set new password" />
    </form>
  );
}

function SecondaryFooter({
  lead,
  action,
  href,
  back,
}: {
  lead?: string;
  action: string;
  href: string;
  back?: boolean;
}) {
  return (
    <div className="text-center text-[13.5px] text-mute">
      {back ? (
        <Link href={href} className="text-accent font-medium">
          ‹ {action}
        </Link>
      ) : (
        <>
          {lead}{" "}
          <Link href={href} className="text-accent font-medium">
            {action} →
          </Link>
        </>
      )}
    </div>
  );
}
