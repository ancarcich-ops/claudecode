import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeUserStats } from "@/lib/userStats";
import {
  expectedAvgScores,
  expectedDistribution,
} from "@/lib/scoringBaseline";
import EmptyIllustration from "@/components/EmptyIllustration";
import RoundHistoryChart from "@/app/stats/RoundHistoryChart";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

// Public-facing profile page for any user in the app. Renders a
// focused, read-only subset of the personal stats page -- the things
// you'd want to show off (Sticks index, avg, best, scoring shape,
// course bests) without the management surfaces (round delete, GHIN
// editor, baseline picker) that only the owner needs.
//
// Self-views redirect to /stats so the owner gets the editable view.
export default async function PublicProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  // Usernames are stored as-typed (mixed case allowed, e.g. "BigPeas"),
  // and links carry that exact case. Match the exact value first, then
  // fall back to a case-insensitive scan so /u/bigpeas, /u/BigPeas, etc.
  // all resolve. (JS compare avoids the Postgres-only mode:insensitive.)
  const raw = decodeURIComponent(params.username).trim();
  let target = await prisma.user.findUnique({
    where: { username: raw },
    select: { id: true, username: true, displayName: true },
  });
  if (!target) {
    const needle = raw.toLowerCase();
    const candidates = await prisma.user.findMany({
      select: { id: true, username: true, displayName: true },
      take: 1000,
    });
    target =
      candidates.find((u) => u.username.toLowerCase() === needle) ?? null;
  }
  if (!target) notFound();

  // Owner viewing their own profile goes to the editable /stats.
  if (target.id === viewer.id) redirect("/stats");

  const stats = await computeUserStats(target.id);
  if (!stats) notFound();

  const displayName = target.displayName ?? target.username;
  const hasAnyData = stats.rounds.length > 0;
  const handicap = stats.handicap;
  const avg18 = stats.avg18Gross;
  const best = stats.bestRound;
  const baselineHcp = 10; // fixed for the public view; no interactive picker

  const formatIndex = (n: number) =>
    n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
  const formatVsPar = (n: number) =>
    n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">
            {displayName}
            <span className="text-mute font-normal"> · profile</span>
          </h1>
          <p className="text-sm text-mute mt-1">
            @{target.username}
          </p>
        </div>
        <ShareButton
          url={`/u/${target.username}`}
          title={`${displayName} on Sticks`}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
        {handicap ? (
          <Chip
            label="Sticks idx"
            value={formatIndex(handicap.index)}
            tone="accent"
          />
        ) : (
          <div
            title="Index unlocks after 3+ logged rounds"
            className="rounded-md border border-dashed border-border bg-panel2 px-2.5 py-1.5 text-center"
          >
            <div className="text-[9px] uppercase tracking-wider text-mute leading-none">
              Sticks idx
            </div>
            <div className="font-display italic font-medium text-sm text-mute leading-tight mt-0.5">
              pending
            </div>
            <div className="text-[9px] text-mute leading-none mt-0.5">
              {Math.min(stats.rounds.length, 3)}/3 rounds
            </div>
          </div>
        )}
        {avg18 != null && (
          <Chip label="Avg 18" value={avg18.toFixed(1)} />
        )}
        {best && (
          <Chip
            label="Best"
            value={formatVsPar(best.vsPar)}
            tone={best.vsPar < 0 ? "accent" : best.vsPar === 0 ? "gold" : "ink"}
            title={`${best.courseName} · ${best.gross}`}
          />
        )}
      </div>

      {!hasAnyData ? (
        <EmptyIllustration
          kind="noStats"
          title={`${displayName} hasn't logged a round yet.`}
          body="Check back once they post their first card."
          action={
            <Link className="btn btn-ghost text-sm" href="/">
              ← Back to matches
            </Link>
          }
        />
      ) : (
        <>
          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink mb-3">
              Rounds over time
            </h2>
            <RoundHistoryChart
              baselineHcp={baselineHcp}
              rounds={stats.rounds.map((r) => ({
                t: r.scheduledAt.getTime(),
                vsPar: r.vsPar,
                holesPlayed: r.holesPlayed,
                courseName: r.courseName,
              }))}
            />
          </section>

          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink mb-3">
              Scoring shape
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <ParStat
                label="Par 3s"
                avgScore={stats.par3.avgScore}
                expected={expectedAvgScores(baselineHcp).par3}
              />
              <ParStat
                label="Par 4s"
                avgScore={stats.par4.avgScore}
                expected={expectedAvgScores(baselineHcp).par4}
              />
              <ParStat
                label="Par 5s"
                avgScore={stats.par5.avgScore}
                expected={expectedAvgScores(baselineHcp).par5}
              />
            </div>
            {stats.distribution.totalHolesPlayed > 0 && (
              <DistributionBlock
                d={stats.distribution.per18}
                baseline={expectedDistribution(baselineHcp)}
              />
            )}
            <p className="text-[11px] text-mute mt-3">
              Per 18 holes vs a {baselineHcp} HI baseline.
            </p>
          </section>

          {stats.courseRecords.length > 0 && (
            <section className="card p-5">
              <h2 className="font-display text-base font-semibold text-ink mb-3">
                Course bests
              </h2>
              <ul className="space-y-1">
                {stats.courseRecords.slice(0, 12).map((c) => (
                  <li
                    key={c.matchId}
                    className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border last:border-b-0"
                  >
                    <span className="truncate">{c.courseName}</span>
                    <span className="font-mono tabular-nums shrink-0">
                      <span className="text-ink">{c.gross}</span>
                      <span className="text-mute">
                        {" "}
                        · net {c.net.toFixed(1)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  tone = "ink",
  title,
}: {
  label: string;
  value: string;
  tone?: "accent" | "gold" | "ink";
  title?: string;
}) {
  const cls = (() => {
    switch (tone) {
      case "accent":
        return "border-accent/30 bg-accent/10 text-accent";
      case "gold":
        return "border-gold/30 bg-gold/10 text-gold";
      default:
        return "border-border bg-panel2 text-ink";
    }
  })();
  return (
    <div
      title={title}
      className={"rounded-md border px-2.5 py-1.5 text-center " + cls}
    >
      <div className="text-[9px] uppercase tracking-wider opacity-80 leading-none">
        {label}
      </div>
      <div className="font-display font-semibold text-lg tabular-nums leading-tight mt-0.5">
        {value}
      </div>
    </div>
  );
}

function ParStat({
  label,
  avgScore,
  expected,
}: {
  label: string;
  avgScore: number | null;
  expected: number;
}) {
  const sg = avgScore === null ? null : expected - avgScore;
  const sgColor =
    sg === null
      ? "text-mute"
      : sg > 0.05
        ? "text-accent"
        : sg < -0.05
          ? "text-danger"
          : "text-mute";
  return (
    <div className="border border-border rounded-md p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-mute">
        {label}
      </div>
      <div className="font-display font-semibold text-2xl mt-1 tabular-nums">
        {avgScore === null ? "—" : avgScore.toFixed(1)}
      </div>
      {sg !== null && (
        <div className={`text-[11px] font-mono tabular-nums mt-1.5 ${sgColor}`}>
          {sg > 0 ? "+" : ""}
          {sg.toFixed(1)} SG / Hole
        </div>
      )}
    </div>
  );
}

function DistributionBlock({
  d,
  baseline,
}: {
  d: { birdiesOrBetter: number; pars: number; bogeys: number; doublesOrWorse: number };
  baseline: {
    birdiesOrBetter: number;
    pars: number;
    bogeys: number;
    doublesOrWorse: number;
  };
}) {
  const rows = [
    { label: "Birdies-", actual: d.birdiesOrBetter, base: baseline.birdiesOrBetter, higherBetter: true },
    { label: "Pars", actual: d.pars, base: baseline.pars, higherBetter: true },
    { label: "Bogeys", actual: d.bogeys, base: baseline.bogeys, higherBetter: false },
    { label: "Doubles+", actual: d.doublesOrWorse, base: baseline.doublesOrWorse, higherBetter: false },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {rows.map((r) => {
        const beating = r.higherBetter ? r.actual >= r.base : r.actual <= r.base;
        return (
          <div
            key={r.label}
            className={
              "rounded-md border px-2 py-2 text-center " +
              (beating ? "border-accent/30 bg-accent/5" : "border-danger/30 bg-danger/5")
            }
          >
            <div className="text-[10px] uppercase tracking-wider text-mute">
              {r.label}
            </div>
            <div className="flex items-baseline justify-center gap-1 mt-0.5">
              <span
                className={
                  "font-mono tabular-nums text-base " +
                  (beating ? "text-accent" : "text-danger")
                }
              >
                {r.actual.toFixed(1)}
              </span>
              <span className="font-mono text-[10px] text-mute">
                vs {r.base.toFixed(1)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
