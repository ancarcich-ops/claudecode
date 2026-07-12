// Public share-my-round page: /r/[token]
//
// No auth -- the unguessable token IS the credential (same model as a
// Google Docs share link; revoked by deleting the RoundShare row).
// Read-only view of one player's live round: thru-N, pace, projected
// finish, ETA home, and the front-9/back-9 scores when the share has
// includeScores. Auto-refreshes every 60s via meta refresh so it works
// with zero client JS.

import { prisma } from "@/lib/db";
import { computePace, driveMinutes } from "@/lib/roundShare";
import { subscribeToRoundShareAction } from "@/lib/subscribeActions";

export const dynamic = "force-dynamic";

// Link-preview metadata: when the share link is texted, iMessage /
// WhatsApp render "Andrew's round status" + course instead of a bare
// token URL.
export async function generateMetadata({
  params,
}: {
  params: { token: string };
}) {
  const share = await prisma.roundShare.findUnique({
    where: { token: params.token },
    include: {
      match: { select: { courseName: true, players: { select: { id: true, displayName: true } } } },
    },
  });
  const player = share?.match.players.find((p) => p.id === share.matchPlayerId);
  if (!share || !player) return { title: "Sticks" };
  const title = `${player.displayName}\u2019s round status`;
  const description = `Live from ${share.match.courseName} \u2014 pace, estimated finish, and ETA. Updates while the round is on.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Sticks" },
    twitter: { card: "summary", title, description },
  };
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: process.env.SHARE_TZ || "America/Los_Angeles",
  });
}

function fmtToPar(toPar: number | null): string {
  if (toPar == null) return "—";
  return toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export default async function ShareRoundPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { sms?: string };
}) {
  const share = await prisma.roundShare.findUnique({
    where: { token: params.token },
    include: {
      match: {
        include: {
          players: {
            include: { scores: { select: { hole: true, strokes: true } } },
          },
        },
      },
    },
  });
  const player = share?.match.players.find((p) => p.id === share.matchPlayerId);
  if (!share || !player) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-mute text-sm">
          This share link is no longer active.
        </p>
      </main>
    );
  }
  const match = share.match;
  let pars: number[] = [];
  try {
    const parsed = match.parData ? JSON.parse(match.parData) : null;
    if (Array.isArray(parsed)) pars = parsed.map((p) => Number(p) || 4);
  } catch {}
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
  const finished = pace.holesPlayed >= match.holes;
  // The sharer's private cushion rides inside the projection itself so
  // the public page stays internally consistent (finish + drive = ETA)
  // with no visible padding.
  const paddedFinish = pace.projectedFinish
    ? new Date(pace.projectedFinish.getTime() + share.bufferMin * 60_000)
    : null;

  let etaHome: Date | null = null;
  if (!finished && paddedFinish && share.destLat != null && share.destLng != null) {
    const course = await prisma.course.findUnique({
      where: { name: match.courseName },
      select: { centerLat: true, centerLng: true },
    });
    if (course?.centerLat != null && course?.centerLng != null) {
      const mins = await driveMinutes(
        { lat: course.centerLat, lng: course.centerLng },
        { lat: share.destLat, lng: share.destLng },
      );
      if (mins != null) {
        etaHome = new Date(paddedFinish.getTime() + mins * 60_000);
      }
    }
  }

  const started = match.status !== "UPCOMING" && pace.holesPlayed > 0;

  return (
    <main className="min-h-screen bg-bg text-ink flex justify-center p-4 sm:p-8">
      {/* Refresh while live so the page tracks the round hands-free. */}
      {!finished && <meta httpEquiv="refresh" content="60" />}
      <div className="w-full max-w-md space-y-4">
        <header className="pt-4">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-mute">
            Sticks · Live round
          </div>
          <h1 className="font-display text-2xl font-semibold mt-1">
            {player.displayName}
          </h1>
          <p className="text-sm text-mute">{match.courseName}</p>
        </header>

        <section className="card p-4">
          {!started ? (
            <p className="text-sm text-mute">
              The round hasn&apos;t started yet — check back soon.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label={finished ? "Final" : `Thru ${pace.holesPlayed}`}
                value={share.includeScores ? fmtToPar(pace.toPar) : finished ? "Done" : "Playing"}
              />
              <Stat
                label="Pace"
                value={
                  pace.minPerHole != null
                    ? `${Math.round(pace.minPerHole * match.holes)} min round`
                    : "—"
                }
              />
              <Stat
                label={finished ? "Finished" : "Est. finish"}
                value={
                  finished
                    ? match.completedAt
                      ? fmtTime(match.completedAt)
                      : "Just now"
                    : paddedFinish
                      ? fmtTime(paddedFinish)
                      : "—"
                }
              />
              <Stat
                label={share.destAddress ? "Home around" : "ETA"}
                value={etaHome ? fmtTime(etaHome) : finished ? "On the way" : "—"}
              />
            </div>
          )}
        </section>

        {share.includeScores && started && (
          <section className="card p-4 overflow-x-auto">
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-mute mb-2">
              Scorecard
            </div>
            <table className="text-center text-sm tabular-nums">
              <tbody>
                <tr className="text-mute">
                  {Array.from({ length: match.holes }, (_, i) => (
                    <td key={i} className="px-1.5 py-0.5 font-mono text-[10px]">
                      {match.startingHole + i}
                    </td>
                  ))}
                </tr>
                <tr>
                  {Array.from({ length: match.holes }, (_, i) => {
                    const s = scoresByHole[match.startingHole + i];
                    return (
                      <td key={i} className="px-1.5 py-0.5 font-semibold">
                        {s ?? "·"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* SMS opt-in. The recipient subscribes THEMSELVES here -- this
            page is the express-consent point for carrier compliance,
            so the language below matters; don't trim it. */}
        <section className="card p-4">
          <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-mute mb-1.5">
            Text me updates
          </div>
          {searchParams?.sms === "on" ? (
            <p className="text-sm text-ink">
              You&apos;re subscribed. Updates will arrive as the round
              progresses. Reply STOP any time to opt out.
            </p>
          ) : (
            <>
              <p className="text-[12px] text-mute mb-2.5">
                Get a text when {player.displayName} makes the turn and
                when the round wraps up — pace, estimated finish, and ETA.
              </p>
              <form
                action={subscribeToRoundShareAction}
                className="flex gap-2"
              >
                <input type="hidden" name="token" value={share.token} />
                <input
                  name="phone"
                  type="tel"
                  required
                  placeholder="(555) 555-1234"
                  className="input h-10 text-sm flex-1"
                  aria-label="Mobile number for text updates"
                />
                <button
                  type="submit"
                  className="btn btn-primary h-10 px-4 text-sm shrink-0"
                >
                  Sign up
                </button>
              </form>
              {searchParams?.sms === "invalid" && (
                <p className="text-danger text-[12px] mt-1.5">
                  That doesn&apos;t look like a valid US mobile number.
                </p>
              )}
              {searchParams?.sms === "full" && (
                <p className="text-danger text-[12px] mt-1.5">
                  This link already has the maximum number of subscribers.
                </p>
              )}
              <p className="text-[11px] text-faint mt-2.5 leading-snug">
                By signing up, you agree to receive recurring automated
                SMS updates about this golf round from Sticks. Message
                frequency varies (typically 2–3 messages per round).
                Message &amp; data rates may apply. Reply STOP to opt out
                at any time, or HELP for help. Consent is not a condition
                of any purchase.
              </p>
            </>
          )}
        </section>

        <p className="text-[11px] text-faint text-center pb-6">
          Updates automatically while the round is live.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-mute">
        {label}
      </div>
      <div className="font-display text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}
