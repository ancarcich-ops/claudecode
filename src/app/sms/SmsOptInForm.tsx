"use client";

import { useRef, useState, useTransition } from "react";
import { recordSmsConsentAction } from "./actions";
import { SMS_CONSENT_TEXT } from "./consent";
import { BUSINESS } from "@/lib/business";

export default function SmsOptInForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (done) {
    return (
      <div className="card p-5 text-center">
        <p className="font-display text-lg font-semibold text-ink">
          You&rsquo;re signed up.
        </p>
        <p className="text-sm text-mute mt-1">
          Watch for a confirmation text from Sticks at{" "}
          <strong>{BUSINESS.smsNumber}</strong>. Reply <strong>STOP</strong> any
          time to unsubscribe, or <strong>HELP</strong> for help.
        </p>
      </div>
    );
  }

  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await recordSmsConsentAction(fd);
      if (res.ok) setDone(true);
      else setError(res.error ?? "Something went wrong.");
    });
  };

  return (
    <form
      ref={formRef}
      action={submit}
      className="card p-5 space-y-4"
      aria-label="SMS opt-in"
    >
      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-ink mb-1"
        >
          Mobile number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="(555) 123-4567"
          className="w-full rounded-md bg-panel2 border border-border px-3 py-2.5 text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        {/* Unchecked by default and intentionally NOT `required` -- SMS
            consent is optional and never forced. The form still submits
            if it's left unchecked (the server simply declines to
            subscribe and asks the user to check the box). Opting in is an
            express, affirmative action the user takes on purpose. */}
        <input
          type="checkbox"
          name="consent"
          value="on"
          className="mt-1 h-4 w-4 shrink-0 accent-accent"
        />
        <span className="text-[13px] leading-relaxed text-mute">
          {SMS_CONSENT_TEXT}
        </span>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full justify-center py-2.5 disabled:opacity-50"
      >
        {pending ? "Signing up…" : "Sign up for text updates"}
      </button>

      <p className="text-[11px] leading-relaxed text-faint">
        Checking the box is optional and is not required to use Sticks. Texts
        are sent by <strong>Sticks</strong> from{" "}
        <strong>{BUSINESS.smsNumber}</strong>. Message frequency varies. Msg
        &amp; data rates may apply. Reply STOP to cancel, HELP for help. See our{" "}
        <a href="/privacy" className="underline hover:text-mute">
          Privacy Policy
        </a>{" "}
        and{" "}
        <a href="/terms" className="underline hover:text-mute">
          Terms of Service
        </a>
        . We never sell your number or share it with third parties for their
        own marketing.
      </p>
    </form>
  );
}
