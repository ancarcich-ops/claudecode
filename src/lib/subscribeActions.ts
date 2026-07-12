"use server";

// SMS opt-in / opt-out for a share link. Deliberately UNAUTHENTICATED:
// the recipient (who has no Sticks account) subscribes THEMSELVES on
// the public /r/[token] page -- that self-service entry is the express
// consent carriers require. The unguessable token scopes everything.

import { redirect } from "next/navigation";
import { prisma } from "./db";
import { normalizeUsPhone } from "./sms";

const MAX_SUBSCRIBERS_PER_SHARE = 5;

export async function subscribeToRoundShareAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const rawPhone = String(formData.get("phone") ?? "");
  const share = await prisma.roundShare.findUnique({
    where: { token },
    select: { id: true, _count: { select: { subscribers: true } } },
  });
  if (!share) redirect(`/r/${encodeURIComponent(token)}`);
  const phone = normalizeUsPhone(rawPhone);
  if (!phone) {
    redirect(`/r/${encodeURIComponent(token)}?sms=invalid`);
  }
  if (share._count.subscribers >= MAX_SUBSCRIBERS_PER_SHARE) {
    redirect(`/r/${encodeURIComponent(token)}?sms=full`);
  }
  // Re-subscribing clears a prior opt-out (they asked again).
  await prisma.roundShareSubscriber.upsert({
    where: { roundShareId_phone: { roundShareId: share.id, phone } },
    update: { optedOutAt: null, consentAt: new Date() },
    create: { roundShareId: share.id, phone },
  });
  redirect(`/r/${encodeURIComponent(token)}?sms=on`);
}

export async function unsubscribeFromRoundShareAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const rawPhone = String(formData.get("phone") ?? "");
  const phone = normalizeUsPhone(rawPhone);
  const share = await prisma.roundShare.findUnique({
    where: { token },
    select: { id: true },
  });
  if (share && phone) {
    await prisma.roundShareSubscriber
      .update({
        where: { roundShareId_phone: { roundShareId: share.id, phone } },
        data: { optedOutAt: new Date() },
      })
      .catch(() => {});
  }
  redirect(`/r/${encodeURIComponent(token)}?sms=off`);
}
