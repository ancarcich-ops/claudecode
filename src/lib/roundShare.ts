// Share-my-round engine. Computes pace / projected finish / ETA-home
// for a live round and emails opted-in recipients when the shared
// player crosses a milestone (front 9 done, every 6 holes, finished).
//
// Trigger model: checkRoundShares(matchId) is called fire-and-forget
// after every score write (web action + mobile API). It re-derives the
// milestone state from the scores themselves, so it doesn't matter
// which client logged the score or in what order -- a milestone fires
// exactly once per share (tracked in sentMilestones).

import { prisma } from "./db";
import { sendEmail, appUrl } from "./email";
import { sendSms, SMS_OPTED_OUT_CODE } from "./sms";

export type MilestoneKey = "FRONT9" | "EVERY6_6" | "EVERY6_12" | "FINISH";

// ---- Pace math ------------------------------------------------------

export type PaceInfo = {
  holesPlayed: number;
  elapsedMin: number | null; // null when the match has no startedAt
  minPerHole: number | null;
  projectedFinish: Date | null;
  toPar: number | null;
};

export function computePace(input: {
  startedAt: Date | null;
  holes: number;
  startingHole: number;
  pars: number[];
  scoresByHole: Record<number, number>;
  now?: Date;
}): PaceInfo {
  const now = input.now ?? new Date();
  const played = Object.keys(input.scoresByHole).length;
  let toPar: number | null = null;
  for (const [holeStr, strokes] of Object.entries(input.scoresByHole)) {
    const idx = Number(holeStr) - input.startingHole;
    const par = input.pars[idx] ?? 4;
    toPar = (toPar ?? 0) + (strokes - par);
  }
  if (!input.startedAt || played === 0) {
    return {
      holesPlayed: played,
      elapsedMin: null,
      minPerHole: null,
      projectedFinish: null,
      toPar,
    };
  }
  const elapsedMin = (now.getTime() - input.startedAt.getTime()) / 60_000;
  const minPerHole = elapsedMin / played;
  // Sanity: nobody plays 40+ minutes a hole. A pace that slow means a
  // stale/abandoned round (started yesterday, scores added today) --
  // showing "3019 min round / finish tomorrow" reads as broken, so
  // suppress the projections and keep the factual fields.
  if (minPerHole > 40) {
    return {
      holesPlayed: played,
      elapsedMin,
      minPerHole: null,
      projectedFinish: null,
      toPar,
    };
  }
  const remaining = Math.max(0, input.holes - played);
  const projectedFinish = new Date(
    now.getTime() + remaining * minPerHole * 60_000,
  );
  return { holesPlayed: played, elapsedMin, minPerHole, projectedFinish, toPar };
}

// ---- Mapbox: geocode + drive time ----------------------------------

function mapboxToken(): string | null {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null;
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const token = mapboxToken();
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { center?: [number, number] }[];
    };
    const c = data.features?.[0]?.center;
    if (!c) return null;
    return { lat: c[1], lng: c[0] };
  } catch {
    return null;
  }
}

export async function driveMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<number | null> {
  const token = mapboxToken();
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: { duration?: number }[] };
    const secs = data.routes?.[0]?.duration;
    if (typeof secs !== "number") return null;
    const mins = secs / 60;
    // Sanity: a 5h+ "drive home" almost always means the destination
    // address geocoded to the wrong city/state. Better no ETA than a
    // next-day one rendered as a bare clock time.
    return mins > 300 ? null : mins;
  } catch {
    return null;
  }
}

// ---- Milestones -----------------------------------------------------

// Which milestones has the player's score state crossed?
export function crossedMilestones(
  enabled: string[],
  holesPlayed: number,
  totalHoles: number,
): MilestoneKey[] {
  const out: MilestoneKey[] = [];
  if (enabled.includes("EVERY6") && holesPlayed >= 6) out.push("EVERY6_6");
  if (enabled.includes("FRONT9") && totalHoles > 9 && holesPlayed >= 9)
    out.push("FRONT9");
  if (enabled.includes("EVERY6") && holesPlayed >= 12) out.push("EVERY6_12");
  if (enabled.includes("FINISH") && holesPlayed >= totalHoles)
    out.push("FINISH");
  return out;
}

function fmtTime(d: Date): string {
  // Times render in the course's local zone eventually; v1 uses
  // America/Los_Angeles since the whole user base plays there.
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.SHARE_TZ || "America/Los_Angeles",
  });
}

function fmtToPar(toPar: number | null): string {
  if (toPar == null) return "";
  return toPar === 0 ? "even" : toPar > 0 ? `+${toPar}` : `${toPar}`;
}

// ---- The check-and-send pass ---------------------------------------

export async function checkRoundShares(matchId: string): Promise<void> {
  const shares = await prisma.roundShare.findMany({
    where: { matchId },
    include: { subscribers: { where: { optedOutAt: null } } },
  });
  if (shares.length === 0) return;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      players: { include: { scores: { select: { hole: true, strokes: true } } } },
    },
  });
  if (!match) return;
  let pars: number[] = [];
  try {
    const parsed = match.parData ? JSON.parse(match.parData) : null;
    if (Array.isArray(parsed)) pars = parsed.map((p) => Number(p) || 4);
  } catch {}

  const course = await prisma.course.findUnique({
    where: { name: match.courseName },
    select: { centerLat: true, centerLng: true },
  });

  for (const share of shares) {
    const player = match.players.find((p) => p.id === share.matchPlayerId);
    if (!player) continue;
    const scoresByHole = Object.fromEntries(
      player.scores.map((s) => [s.hole, s.strokes]),
    );
    const pace = computePace({
      startedAt: match.startedAt,
      holes: match.holes,
      startingHole: match.startingHole,
      pars,
      scoresByHole,
    });
    const enabled = share.milestones.split(",").map((m) => m.trim());
    const already = new Set(
      share.sentMilestones.split(",").filter(Boolean),
    );
    const due = crossedMilestones(enabled, pace.holesPlayed, match.holes).filter(
      (m) => !already.has(m),
    );
    if (due.length === 0) continue;
    // Apply the sharer's private cushion to everything time-shaped the
    // recipient will read.
    if (pace.projectedFinish && share.bufferMin > 0) {
      pace.projectedFinish = new Date(
        pace.projectedFinish.getTime() + share.bufferMin * 60_000,
      );
    }
    // Send only the most advanced due milestone (scores can arrive in
    // bursts -- one email, not three).
    const milestone = due[due.length - 1];

    // ETA home: projected finish + drive time, when we have both a
    // destination and course coordinates.
    let etaHome: Date | null = null;
    if (
      pace.projectedFinish &&
      share.destLat != null &&
      share.destLng != null &&
      course?.centerLat != null &&
      course?.centerLng != null
    ) {
      const mins = await driveMinutes(
        { lat: course.centerLat, lng: course.centerLng },
        { lat: share.destLat, lng: share.destLng },
      );
      if (mins != null) {
        etaHome = new Date(pace.projectedFinish.getTime() + mins * 60_000);
      }
    }

    const name = player.displayName;
    const thru = pace.holesPlayed;
    const isFinish = milestone === "FINISH";
    const subject = isFinish
      ? `${name} finished at ${match.courseName}`
      : `${name} is through ${thru} at ${match.courseName}`;
    const scoreBit =
      share.includeScores && pace.toPar != null
        ? ` ${isFinish ? "Final" : "Currently"} ${fmtToPar(pace.toPar)}.`
        : "";
    const paceBit = pace.projectedFinish
      ? isFinish
        ? ""
        : ` Estimated finish ${fmtTime(pace.projectedFinish)}.`
      : "";
    const etaBit = etaHome && !isFinish ? ` Home around ${fmtTime(etaHome)}.` : "";
    const link = `${appUrl()}/r/${share.token}`;
    const text = `${subject}.${scoreBit}${paceBit}${etaBit}\n\nLive view: ${link}`;
    const html = `<p>${subject}.${scoreBit}${paceBit}${etaBit}</p><p><a href="${link}">Follow the round live</a></p>`;

    if (share.recipientEmail) {
      await sendEmail({ to: share.recipientEmail, subject, html, text }).catch(
        () => {},
      );
    }
    // SMS to everyone who self-subscribed on the share page. A STOP
    // reply is enforced by Twilio at the carrier level; when a send
    // bounces with the opted-out code we mirror that locally so we
    // stop attempting.
    const smsText = `${text}\nReply STOP to opt out.`;
    for (const sub of share.subscribers) {
      const res = await sendSms(sub.phone, smsText);
      if (!res.ok && res.code === SMS_OPTED_OUT_CODE) {
        await prisma.roundShareSubscriber
          .update({
            where: { id: sub.id },
            data: { optedOutAt: new Date() },
          })
          .catch(() => {});
      }
    }
    await prisma.roundShare.update({
      where: { id: share.id },
      data: {
        sentMilestones: [...already, ...due].join(","),
      },
    });
  }
}
