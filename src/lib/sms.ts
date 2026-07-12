// SMS sending via Twilio's REST API. No SDK -- it's one form-encoded
// POST with basic auth. Mirrors email.ts: when the env vars are unset
// the send is a logged no-op, so the feature ships dormant and lights
// up the moment TWILIO_* variables land in Vercel.
//
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

export type SmsResult =
  | { ok: true }
  | { ok: false; code: number | null; error: string };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !auth || !from) {
    console.warn(`[sms] TWILIO_* unset -- would have texted ${to}`);
    return { ok: false, code: null, error: "not configured" };
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${auth}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        code?: number;
        message?: string;
      };
      return {
        ok: false,
        code: data.code ?? res.status,
        error: data.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      code: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Twilio error code for "recipient has opted out" (replied STOP).
export const SMS_OPTED_OUT_CODE = 21610;

// Normalize a US phone entry to E.164. Returns null when it doesn't
// look like a usable number.
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 11 && digits.length <= 15)
    return `+${digits}`;
  return null;
}
