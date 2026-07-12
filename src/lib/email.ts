// Transactional email via Resend's REST API (no SDK dependency).
//
// Env:
//   RESEND_API_KEY  -- required to actually send. When unset, sendEmail
//                      logs the message and returns false so the app
//                      degrades gracefully in dev / before setup.
//   RESEND_FROM     -- the From address, e.g. "Sticks <no-reply@yourdomain.com>".
//                      Must be on a domain you've verified in Resend.
//                      Falls back to Resend's onboarding sender, which
//                      only delivers to the account owner's address.
//   APP_URL         -- public base URL for building links (e.g.
//                      https://sticks-golf.vercel.app). No trailing slash.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function appUrl(): string {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

// Detailed send result -- lets callers (and the diagnostics route) see
// exactly why an email didn't go out: no key configured (skipped), a
// Resend API rejection (status + body, e.g. "domain not verified" or a
// from-address that isn't allowed), or a network error.
export type EmailResult = {
  ok: boolean;
  // True when we deliberately didn't attempt a send (no API key). Not
  // an error -- the app degrades gracefully -- but nothing was sent.
  skipped?: boolean;
  status?: number;
  error?: string;
  // The From we used, so a diagnostic can flag the onboarding fallback
  // (which only delivers to the Resend account owner).
  from: string;
};

export async function sendEmailResult(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Sticks <onboarding@resend.dev>";
  if (!apiKey) {
    // No provider configured -- don't throw (so signup/reset still
    // work in dev); just record that the email wasn't sent.
    console.warn(
      `[email] RESEND_API_KEY unset -- would have sent "${opts.subject}" to ${opts.to}`,
    );
    return { ok: false, skipped: true, from };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend ${res.status}: ${body}`);
      return { ok: false, status: res.status, error: body, from };
    }
    return { ok: true, status: res.status, from };
  } catch (err) {
    const error = (err as Error).message;
    console.error("[email] send failed:", error);
    return { ok: false, error, from };
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  return (await sendEmailResult(opts)).ok;
}

export function passwordResetEmail(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Reset your Sticks password";
  const text = [
    "Someone requested a password reset for your Sticks account.",
    "",
    `Reset it here (link expires in 1 hour): ${resetUrl}`,
    "",
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Reset your Sticks password</h2>
      <p style="color:#555;line-height:1.5">Someone requested a password reset for your account. Click below to set a new password. This link expires in 1 hour.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#34d399;color:#06281d;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;display:inline-block">Reset password</a>
      </p>
      <p style="color:#888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `.trim();
  return { subject, html, text };
}
