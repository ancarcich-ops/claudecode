import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { computeUserStats } from "@/lib/userStats";

export const dynamic = "force-dynamic";

export default async function PersonalStatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stats = await computeUserStats(user.id);
  if (!stats) redirect("/");

  const displayName = stats.displayName ?? stats.username;
  const hasAnyData = stats.matchesPlayed > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {displayName}
          <span className="text-mute font-normal"> · personal stats</span>
        </h1>
        <p className="text-sm text-mute mt-1">
          Every completed match you played, regardless of group scoping.
        </p>
      </div>

      {!hasAnyData ? (
        <div className="card p-6 text-sm text-mute">
          You haven&apos;t finished a round yet. Stats fill in as matches
          wrap up.{" "}
          <Link className="text-accent" href="/matches/new">
            Post one →
          </Link>
        </div>
      ) : (
        <>
          {/* Top-line counters */}
          <section className="card p-5">
            <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
              At a glance
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Matches" value={stats.matchesPlayed} />
              <Stat label="Total wins" value={stats.totalWins} accent />
              <Stat
                label="Win rate"
                value={
                  stats.matchesPlayed === 0
                    ? "—"
                    : `${Math.round(
                        (stats.mainWins / stats.matchesPlayed) * 100,
                      )}%`
                }
                sub={`${stats.mainWins} main wins`}
              />
              <Stat
                label="Current streak"
                value={stats.currentMainStreak}
                sub={`best · ${stats.bestMainStreak}`}
              />
            </div>
          </section>

          {/* Wins by game */}
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

          {/* Performance by hole type */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-sm uppercase tracking-wider text-mute">
                Performance by par
              </h2>
              <span className="text-[11px] text-mute">
                lower vs par is better
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ParBucket label="Par 3s" bucket={stats.par3} />
              <ParBucket label="Par 4s" bucket={stats.par4} />
              <ParBucket label="Par 5s" bucket={stats.par5} />
            </div>
          </section>

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

function ParBucket({
  label,
  bucket,
}: {
  label: string;
  bucket: {
    holesPlayed: number;
    strokes: number;
    vsPar: number;
    avgVsPar: number | null;
  };
}) {
  const avg = bucket.avgVsPar;
  const color =
    avg === null
      ? "text-mute"
      : avg < 0
        ? "text-accent"
        : avg === 0
          ? "text-gold"
          : "text-mute";
  return (
    <div className="border border-border rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wider text-mute">
        {label}
      </div>
      {avg === null ? (
        <div className="font-mono tabular-nums text-xl mt-0.5 text-mute">—</div>
      ) : (
        <>
          <div
            className={`font-mono tabular-nums text-xl mt-0.5 ${color}`}
            title={`${bucket.strokes} strokes over ${bucket.holesPlayed} holes (${bucket.vsPar >= 0 ? "+" : ""}${bucket.vsPar} vs par)`}
          >
            {avg >= 0 ? "+" : ""}
            {avg.toFixed(2)}
          </div>
          <div className="text-[10px] text-mute mt-0.5">
            {bucket.holesPlayed} hole{bucket.holesPlayed === 1 ? "" : "s"}
          </div>
        </>
      )}
    </div>
  );
}
