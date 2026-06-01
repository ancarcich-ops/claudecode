import type { Game, GameSide } from '@/lib/types';

const LEVEL_BADGE: Record<string, string> = {
  AAA: 'bg-braves-red',
  AA: 'bg-orange-600',
  'High-A': 'bg-amber-600',
  'Low-A': 'bg-emerald-700',
  Rookie: 'bg-sky-700',
  DSL: 'bg-indigo-700',
};

function Row({ side, winner }: { side: GameSide; winner: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={[
          'truncate',
          side.isBraves ? 'font-semibold text-white' : 'text-white/70',
          winner ? '' : '',
        ].join(' ')}
      >
        {side.name}
      </span>
      <span className={['ml-3 tabular-nums', winner ? 'font-bold text-white' : 'text-white/70'].join(' ')}>
        {side.runs ?? '–'}
      </span>
    </div>
  );
}

function statusText(game: Game): string {
  if (game.state === 'scheduled') {
    if (!game.startTimeUTC) return 'Scheduled';
    const t = new Date(game.startTimeUTC);
    return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return game.inning || game.detailedState;
}

export default function ScoreCard({ game }: { game: Game }) {
  const homeWins = game.state === 'final' && (game.home.runs ?? -1) > (game.away.runs ?? -1);
  const awayWins = game.state === 'final' && (game.away.runs ?? -1) > (game.home.runs ?? -1);
  const live = game.state === 'live';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
            LEVEL_BADGE[game.level] ?? 'bg-slate-600'
          }`}
        >
          {game.level}
        </span>
        <span
          className={[
            'text-xs',
            live ? 'font-semibold text-braves-red' : 'text-white/50',
          ].join(' ')}
        >
          {live && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-braves-red align-middle" />}
          {statusText(game)}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <Row side={game.away} winner={awayWins} />
        <Row side={game.home} winner={homeWins} />
      </div>
    </div>
  );
}
