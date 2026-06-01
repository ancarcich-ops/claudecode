import { getScoreboard } from '@/lib/mlb';
import ScoreCard from '@/components/ScoreCard';

// Scores change often during games — keep this page fresh.
export const revalidate = 60;

/** Today's date (YYYY-MM-DD) in US Eastern, where the Braves system plays. */
function easternToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const date = searchParams.date || easternToday();
  const { games, isMock } = await getScoreboard(date);

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Today Around the Farm</h1>
          <p className="text-sm text-white/50">{prettyDate(date)}</p>
        </div>
        {isMock && (
          <span className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-300">
            sample data
          </span>
        )}
      </div>

      {games.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/50">
          No games scheduled across the system today.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <ScoreCard key={g.gamePk} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
