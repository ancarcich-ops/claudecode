import type { Game, GameSide } from '@/lib/types';
import TeamMonogram from './TeamMonogram';

const LEVEL_STYLE: Record<string, string> = {
  AAA: 'bg-braves-red/15 text-red-300 ring-braves-red/30',
  AA: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  'High-A': 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  'Low-A': 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  Rookie: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  DSL: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
};

function Row({ side, winner, dim }: { side: GameSide; winner: boolean; dim: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${dim ? 'opacity-55' : ''}`}>
      <TeamMonogram name={side.name} abbreviation={side.abbreviation} isBraves={side.isBraves} size={34} />
      <span className={`flex-1 truncate text-sm ${side.isBraves ? 'font-semibold text-white' : 'text-slate-300'}`}>
        {side.name}
      </span>
      {winner && <span className="text-[10px] text-braves-gold">▸</span>}
      <span className={`ml-1 w-6 text-right text-lg tabular-nums ${winner ? 'font-bold text-white' : 'font-medium text-slate-400'}`}>
        {side.runs ?? '–'}
      </span>
    </div>
  );
}

function StatusBadge({ game }: { game: Game }) {
  if (game.state === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-braves-red/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-braves-red/30">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-braves-red opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-braves-red" />
        </span>
        {game.inning || 'LIVE'}
      </span>
    );
  }
  if (game.state === 'final') {
    return <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{game.inning || 'Final'}</span>;
  }
  const t = game.startTimeUTC
    ? new Date(game.startTimeUTC).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : 'Scheduled';
  return <span className="text-[11px] font-medium text-slate-400">{t}</span>;
}

export default function ScoreCard({ game }: { game: Game }) {
  const homeWins = game.state === 'final' && (game.home.runs ?? -1) > (game.away.runs ?? -1);
  const awayWins = game.state === 'final' && (game.away.runs ?? -1) > (game.home.runs ?? -1);
  const decided = game.state === 'final';
  const live = game.state === 'live';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl p-3.5 shadow-card transition-all duration-300 glass glass-hover hover:-translate-y-0.5 ${
        live ? 'ring-1 ring-braves-red/40' : ''
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
            LEVEL_STYLE[game.level] ?? 'bg-slate-500/15 text-slate-300 ring-slate-500/30'
          }`}
        >
          {game.level}
        </span>
        <StatusBadge game={game} />
      </div>
      <div className="space-y-1.5">
        <Row side={game.away} winner={awayWins} dim={decided && !awayWins} />
        <Row side={game.home} winner={homeWins} dim={decided && !homeWins} />
      </div>
    </div>
  );
}
