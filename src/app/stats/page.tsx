import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeUserStats, type ScoreDistribution } from "@/lib/userStats";
import {
  BASELINE_HANDICAPS,
  expectedAvgScores,
  expectedDistribution,
} from "@/lib/scoringBaseline";
import EmptyIllustration from "@/components/EmptyIllustration";
import BaselinePicker from "./BaselinePicker";
import RoundHistoryChart from "./RoundHistoryChart";
import RoundsList from "./RoundsList";

export const dynamic = "force-dynamic";

export default async function PersonalStatsPage({
  searchParams,
}: {
  searchParams: { vs?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stats = await computeUserStats(user.id);
  if (!stats) redirect("/");

  // Pull the GHIN # alongside computed stats so we can render the chip on
  // the page header next to the auto-calc index.
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { ghinNumber: true },
  });

  const displayName = stats.displayName ?? stats.username;
  // "Any data" = any logged round. Solo rounds still produce analytics
  // (chart, scoring breakdown, handicap, course bests) so we don't gate
  // the whole page on matchesPlayed (which counts competitive matches
  // only). The At-a-glance / Wins-by-game sections each gate themselves
  // on matchesPlayed below.
  const hasAnyData = stats.rounds.length > 0;
  const hasCompetitive = stats.matchesPlayed > 0;
  const handicap = stats.handicap;
  const ghin = profile?.ghinNumber ?? null;
  const avg18 = stats.avg18Gross;
  const best = stats.bestRound;
  const formatIndex = (n: number) =>
    n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
  const formatVsPar = (n: number) =>
    n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;

  // Baseline handicap for the comparison view. Default 10 -- a fair middle
  // for casual players that mirrors the screenshot we modeled this on.
  const rawVs = Number(searchParams.vs);
  const baselineHcp = (BASELINE_HANDICAPS as readonly number[]).includes(rawVs)
    ? (rawVs as number)
    : 10;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">
            {displayName}
            <span className="text-mute font-normal"> · personal stats</span>
          </h1>
          <p className="text-sm text-mute mt-1">
            Every completed match you played, regardless of group scoping.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 w-full justify-center flex-wrap sm:w-auto sm:justify-end">
          {handicap && (
            <Link
              href="/settings"
              className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-center hover:border-accent/50 transition-colors"
              title="Auto-computed from your last 20 rounds"
            >
              <div className="text-[9px] uppercase tracking-wider text-accent/80 leading-none">
                Sticks idx
              </div>
              <div className="font-display font-semibold text-lg tabular-nums text-accent leading-tight">
                {formatIndex(handicap.index)}
              </div>
            </Link>
          )}
          {avg18 != null && (
            <div
              className="rounded-md border border-border bg-panel2 px-2.5 py-1.5 text-center"
              title="Average gross score across your 18-hole rounds"
            >
              <div className="text-[9px] uppercase tracking-wider text-mute leading-none">
                Avg 18
              </div>
              <div className="font-display font-semibold text-lg tabular-nums text-ink leading-tight mt-0.5">
                {avg18.toFixed(1)}
              </div>
            </div>
          )}
          {best && (
            <div
              className="rounded-md border border-border bg-panel2 px-2.5 py-1.5 text-center"
              title={`${best.courseName} · ${best.gross} on ${new Date(
                best.scheduledAt,
              ).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
            >
              <div className="text-[9px] uppercase tracking-wider text-mute leading-none">
                Best
              </div>
              <div
                className={
                  "font-display font-semibold text-lg tabular-nums leading-tight mt-0.5 " +
                  (best.vsPar < 0
                    ? "text-accent"
                    : best.vsPar === 0
                      ? "text-gold"
                      : "text-ink")
                }
              >
                {formatVsPar(best.vsPar)}
              </div>
            </div>
          )}
          {ghin && (
            <div
              className="rounded-md border border-border bg-panel2 px-2.5 py-1.5 text-center"
              title="Your USGA GHIN number"
            >
              <div className="text-[9px] uppercase tracking-wider text-mute leading-none">
                GHIN
              </div>
              <div className="font-mono tabular-nums text-sm text-ink leading-tight mt-0.5">
                #{ghin}
              </div>
            </div>
          )}
        </div>
      </div>

      {!hasAnyData ? (
        <EmptyIllustration
          kind="noStats"
          title="Nothing logged yet."
          body="Your stats fill in as rounds wrap up."
          action={
            <Link className="btn btn-primary text-sm" href="/matches/new">
              Post a round →
            </Link>
          }
        />
      ) : (
        <>
          {/* Top-line counters. Only render when the user has competitive
              matches (2+ players); solo rounds don't contribute to wins
              or streaks. */}
          {hasCompetitive && (
            <section className="card p-5">
              <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
                At a glance
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Matches" value={stats.matchesPlayed} />
                <Stat label="Total wins" value={stats.totalWins} accent />
                <Stat
                  label="Win rate"
                  value={`${Math.round(
                    (stats.mainWins / stats.matchesPlayed) * 100,
                  )}%`}
                  sub={`${stats.mainWins} main wins`}
                />
                <Stat
                  label="Current streak"
                  value={stats.currentMainStreak}
                  sub={`best · ${stats.bestMainStreak}`}
                />
              </div>
            </section>
          )}

          {/* Wins by game -- also competitive-only. */}
          {hasCompetitive && (
          <section className="card p-5">
            <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
              Wins by game
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
              <Stat label="Main" value={stats.mainWins} />
              <Stat label="Staple" value={stats.stablefordWins} />
              <Stat label="Skins" value={stats.skinsWins} />
              <Stat label="Nassau" value={stats.nassauWins} />
              <Stat label="BBB" value={stats.bbbWins} />
              <Stat label="Snake" value={stats.snakeWins} />
              <Stat label="Wolf" value={stats.wolfWins} />
            </div>
          </section>
          )}

          {/* Round-by-round vs par */}
          {stats.rounds.length >= 1 && (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className="text-sm uppercase tracking-wider text-mute">
                  Rounds over time
                </h2>
                <span className="text-[11px] text-mute">vs par · lower is better</span>
              </div>
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
          )}

          {/* Scoring analysis */}
          <ScoringAnalysis stats={stats} baselineHcp={baselineHcp} />

          {/* Course records */}
          {stats.courseRecords.length > 0 && (
            <section className="card p-5">
              <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
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
              {stats.courseRecords.length > 12 && (
                <p className="text-[11px] text-mute mt-2">
                  +{stats.courseRecords.length - 12} more
                </p>
              )}
            </section>
          )}

          {/* Logged rounds with inline delete -- lives at the bottom so the
              scrolling experience leads with analytics, not data management. */}
          {stats.rounds.length > 0 && (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className="text-sm uppercase tracking-wider text-mute">
                  Logged rounds
                </h2>
                <span className="text-[11px] text-mute">tap × to delete</span>
              </div>
              <RoundsList
                rounds={[...stats.rounds]
                  .reverse()
                  .map((r) => ({
                    matchId: r.matchId,
                    courseName: r.courseName,
                    scheduledAt: r.scheduledAt.toISOString(),
                    holesPlayed: r.holesPlayed,
                    vsPar: r.vsPar,
                  }))}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wider text-mute">
        {label}
      </div>
      <div
        className={
          "font-mono tabular-nums text-2xl mt-0.5 " +
          (accent ? "text-accent" : "")
        }
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-mute mt-0.5">{sub}</div>}
    </div>
  );
}

function ScoringAnalysis({
  stats,
  baselineHcp,
}: {
  stats: { par3: ParBucket; par4: ParBucket; par5: ParBucket; distribution: ScoreDistribution };
  baselineHcp: number;
}) {
  const expected = expectedAvgScores(baselineHcp);
  const expectedDist = expectedDistribution(baselineHcp);
  const hasDist = stats.distribution.totalHolesPlayed > 0;

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm uppercase tracking-wider text-mute">
          Scoring analysis
        </h2>
        <BaselinePicker selected={baselineHcp} id="analysis-vs" />
      </div>

      {/* Par-type cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <ParCard
          label="Par 3s"
          bucket={stats.par3}
          baselineScore={expected.par3}
          baselinePar={3}
        />
        <ParCard
          label="Par 4s"
          bucket={stats.par4}
          baselineScore={expected.par4}
          baselinePar={4}
        />
        <ParCard
          label="Par 5s"
          bucket={stats.par5}
          baselineScore={expected.par5}
          baselinePar={5}
        />
      </div>

      {/* Distribution bars */}
      {hasDist && (
        <div className="mt-5 space-y-4">
          <DistRow
            label="Birdies-"
            actual={stats.distribution.per18.birdiesOrBetter}
            baseline={expectedDist.birdiesOrBetter}
            higherIsBetter
          />
          <DistRow
            label="Pars"
            actual={stats.distribution.per18.pars}
            baseline={expectedDist.pars}
            higherIsBetter
          />
          <DistRow
            label="Bogeys"
            actual={stats.distribution.per18.bogeys}
            baseline={expectedDist.bogeys}
            higherIsBetter={false}
          />
          <DistRow
            label="Doubles+"
            actual={stats.distribution.per18.doublesOrWorse}
            baseline={expectedDist.doublesOrWorse}
            higherIsBetter={false}
          />
          <p className="text-[11px] text-mute pt-1">
            Per 18 holes vs a {baselineHcp} HI baseline. Triangle = baseline,
            bar = your average.
          </p>
        </div>
      )}
    </section>
  );
}

type ParBucket = {
  holesPlayed: number;
  strokes: number;
  vsPar: number;
  avgVsPar: number | null;
  avgScore: number | null;
};

function ParCard({
  label,
  bucket,
  baselineScore,
}: {
  label: string;
  bucket: ParBucket;
  baselineScore: number;
  baselinePar: number;
}) {
  const avg = bucket.avgScore;
  // Strokes-gained per hole vs the baseline player: positive = better
  // (you played fewer strokes than they would on that hole).
  const sg = avg === null ? null : baselineScore - avg;
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
      {avg === null ? (
        <>
          <div className="font-display font-semibold text-2xl mt-1 text-mute">
            —
          </div>
          <div className="text-[10px] text-mute mt-0.5">no holes yet</div>
        </>
      ) : (
        <>
          <div className="font-display font-semibold text-2xl mt-1 tabular-nums">
            {avg.toFixed(1)}
          </div>
          <div className="text-[10px] text-mute mt-0.5">Avg. Score</div>
          {sg !== null && (
            <div
              className={`text-[11px] font-mono tabular-nums mt-1.5 ${sgColor}`}
            >
              {sg > 0 ? "+" : ""}
              {sg.toFixed(1)} SG / Hole
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DistRow({
  label,
  actual,
  baseline,
  higherIsBetter,
}: {
  label: string;
  actual: number;
  baseline: number;
  higherIsBetter: boolean;
}) {
  // Shared scale across both endpoints so the relative position reads
  // honestly. Pad 15% so values right at the max don't kiss the edge.
  const max = Math.max(actual, baseline, 1) * 1.15;
  const actualPct = Math.min(100, (actual / max) * 100);
  const baselinePct = Math.min(100, (baseline / max) * 100);
  const beating = higherIsBetter ? actual >= baseline : actual <= baseline;
  const barColor = beating ? "bg-accent/70" : "bg-danger/70";
  const valColor = beating ? "text-accent" : "text-danger";

  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
      <div className="text-sm text-ink">{label}</div>
      <div className="relative h-12">
        {/* Actual value, anchored to the right end of the user bar. */}
        <div
          className={`absolute top-0 text-[11px] font-mono tabular-nums ${valColor}`}
          style={{
            left: `calc(${actualPct}% - 1rem)`,
          }}
        >
          {actual.toFixed(1)}
        </div>
        {/* Track */}
        <div
          className="absolute left-0 right-0 h-1 bg-border rounded-full"
          style={{ top: "1.25rem" }}
        />
        {/* User bar */}
        <div
          className={`absolute h-1 ${barColor} rounded-full`}
          style={{
            top: "1.25rem",
            left: 0,
            width: `${actualPct}%`,
          }}
        />
        {/* Baseline triangle below the bar */}
        <div
          className="absolute text-mute"
          style={{
            left: `calc(${baselinePct}% - 0.375rem)`,
            top: "1.75rem",
            lineHeight: 1,
          }}
          aria-hidden
        >
          <svg width="12" height="8" viewBox="0 0 12 8" fill="currentColor">
            <path d="M6 0 L12 8 L0 8 Z" />
          </svg>
        </div>
        {/* Baseline value */}
        <div
          className="absolute text-[10px] font-mono tabular-nums text-mute"
          style={{
            left: `calc(${baselinePct}% - 0.75rem)`,
            bottom: 0,
          }}
        >
          {baseline.toFixed(1)}
        </div>
      </div>
    </div>
  );
}
