"use server";

// Records a general SMS opt-in from the public /sms page: validates the
// number, requires the consent box, and stores the phone + the exact
// consent language + timestamp as a standing consent record.

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { normalizeUsPhone } from "@/lib/sms";
import { SMS_CONSENT_TEXT } from "./consent";

export async function recordSmsConsentAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const consent = formData.get("consent");
  if (consent !== "on" && consent !== "true") {
    return {
      ok: false,
      error: "Please check the box to agree to receive text messages.",
    };
  }
  const phone = normalizeUsPhone(String(formData.get("phone") ?? ""));
  if (!phone) {
    return { ok: false, error: "Enter a valid U.S. mobile number." };
  }
  try {
    const ua = headers().get("user-agent")?.slice(0, 300) ?? null;
    await prisma.smsConsent.create({
      data: {
        phone,
        consentText: SMS_CONSENT_TEXT,
        source: "web-opt-in",
        userAgent: ua,
      },
    });
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return { ok: true };
}
