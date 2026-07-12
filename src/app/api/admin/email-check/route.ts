// GET /api/admin/email-check        -> report the effective email config
// GET /api/admin/email-check?send=1 -> also fire a real test email to the
//                                      signed-in user's OWN address and
//                                      return Resend's exact response
//
// Purpose: the forgot-password flow always answers "check your email"
// (anti-enumeration), which hides whether the send actually happened.
// This surfaces the real state so you can tell a config problem
// (RESEND_API_KEY unset, RESEND_FROM not a verified domain) from a
// working setup -- without exposing any secret values.
//
// Guarded: requires a signed-in user, and the test send only ever goes
// to that user's own email, so it can't be used to spam or to probe
// other accounts.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { appUrl, sendEmailResult } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const from = process.env.RESEND_FROM || "Sticks <onboarding@resend.dev>";
  const keyConfigured = !!process.env.RESEND_API_KEY;
  const usingOnboardingFallback = !process.env.RESEND_FROM;

  // Non-secret config snapshot. We never echo the API key -- only whether
  // it's present -- and only the From/APP_URL, which aren't secrets.
  const config = {
    resendKeyConfigured: keyConfigured,
    from,
    // The onboarding sender only delivers to the Resend account owner's
    // address -- the classic "works for me, not for other users" trap.
    usingOnboardingFallback,
    appUrlConfigured: !!process.env.APP_URL,
    effectiveAppUrl: appUrl(),
  };

  const wantSend = new URL(req.url).searchParams.get("send") === "1";
  if (!wantSend) {
    return NextResponse.json({
      config,
      hint: keyConfigured
        ? usingOnboardingFallback
          ? "Key set, but RESEND_FROM is unset -> emails only reach the Resend account owner. Set RESEND_FROM to a verified domain. Add ?send=1 to test-send to yourself."
          : "Config looks complete. Add ?send=1 to fire a real test email to your own address and see Resend's response."
        : "RESEND_API_KEY is not set in this environment -> no email is ever sent. Add it in Vercel project settings.",
    });
  }

  if (!user.email) {
    return NextResponse.json(
      { config, sent: false, error: "Your account has no email on file." },
      { status: 400 },
    );
  }

  const result = await sendEmailResult({
    to: user.email,
    subject: "Sticks email diagnostic",
    text: `This is a test email from the Sticks email diagnostic. If you received it, transactional email is working. Sent via ${from}.`,
    html: `<div style="font-family:system-ui,sans-serif;padding:16px"><h2>Email is working</h2><p>This is a test from the Sticks email diagnostic. If you're reading this, password-reset emails will deliver too.</p></div>`,
  });

  return NextResponse.json({
    config,
    sentTo: user.email,
    result,
    hint: result.ok
      ? "Sent. Check your inbox (and spam). If it lands, the forgot-password email works."
      : result.skipped
        ? "Not sent: RESEND_API_KEY is unset in this environment."
        : `Resend rejected the send${result.status ? ` (HTTP ${result.status})` : ""}. The 'error' field has the reason -- most often the From domain isn't verified in Resend.`,
  });
}
