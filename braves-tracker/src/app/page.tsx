import { getScoreboard } from '@/lib/mlb';
import type { Game, Level } from '@/lib/types';
import ScoreCard from '@/components/ScoreCard';
import { Reveal, Stagger } from '@/components/motion';
import { Radio, Trophy, Clock, Layers } from 'lucide-react';

export const revalidate = 60;

const LEVEL_ORDER: Level[] = ['AAA', 'AA', 'High-A', 'Low-A', 'Rookie', 'DSL'];

function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function StatChip({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Radio;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className={`glass flex items-center gap-2.5 rounded-xl px-3 py-2 ${accent ? 'ring-1 ring-braves-red/40' : ''}`}>
      <Icon className={`h-4 w-4 ${accent ? 'text-braves-red' : 'text-slate-400'}`} />
      <div className="leading-tight">
        <div className="text-base font-bold tabular-nums">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const date = searchParams.date || easternToday();
  const { games, isMock } = await getScoreboard(date);

  const live = games.filter((g) => g.state === 'live').length;
  const finals = games.filter((g) => g.state === 'final').length;
  const upcoming = games.filter((g) => g.state === 'scheduled').length;

  const byLevel = LEVEL_ORDER.map((level) => ({
    level,
    games: games.filter((g) => g.level === level),
  })).filter((g) => g.games.length > 0);

  return (
    <div>
      <Reveal>
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-braves-red">
              Around the Farm
            </span>
            {isMock && (
              <span className="rounded-full bg-braves-gold/15 px-2 py-0.5 text-[10px] font-semibold text-braves-gold ring-1 ring-braves-gold/30">
                sample data
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Today&apos;s Slate
          </h1>
          <p className="mt-1 text-sm text-slate-400">{prettyDate(date)}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip icon={Radio} value={live} label="Live" accent={live > 0} />
            <StatChip icon={Trophy} value={finals} label="Final" />
            <StatChip icon={Clock} value={upcoming} label="Upcoming" />
            <StatChip icon={Layers} value={byLevel.length} label="Levels playing" />
          </div>
        </div>
      </Reveal>

      {games.length === 0 ? (
        <Reveal delay={0.1}>
          <div className="glass rounded-2xl px-6 py-16 text-center">
            <p className="text-lg font-semibold text-slate-200">Quiet day on the farm</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
              No games scheduled across the system today. Lower levels like FCL and DSL
              start their seasons in June — check back soon.
            </p>
          </div>
        </Reveal>
      ) : (
        <div className="space-y-8">
          {byLevel.map(({ level, games: levelGames }, i) => (
            <section key={level}>
              <Reveal delay={0.05 * i}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">{level}</h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  <span className="text-xs text-slate-500">{levelGames.length} game{levelGames.length > 1 ? 's' : ''}</span>
                </div>
              </Reveal>
              <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {levelGames.map((g: Game) => (
                  <Stagger.Item key={g.gamePk}>
                    <ScoreCard game={g} />
                  </Stagger.Item>
                ))}
              </Stagger>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
