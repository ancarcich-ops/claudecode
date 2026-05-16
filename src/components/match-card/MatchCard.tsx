// Top-level Match Card. Status-aware: renders one of three layouts
// (LIVE / SETTLED / UPCOMING) sharing a common shell. Whole card is a
// single tap target -> /matches/[id].

import Link from "next/link";
import type { MatchCardData } from "@/lib/matchCard";
import StatusPill from "./StatusPill";
import HeaderTicker from "./HeaderTicker";
import PeekHole from "./PeekHole";
import PlayerRowLive from "./PlayerRowLive";
import PlayerRowUpcoming from "./PlayerRowUpcoming";
import PlayerRowSettled from "./PlayerRowSettled";

export default function MatchCard({ data }: { data: MatchCardData }) {
  const isLive = data.status === "IN_PROGRESS";
  const isSettled = data.status === "COMPLETED";
  const isUpcoming = data.status === "UPCOMING";

  const cardCls =
    "card p-4 sm:p-5 block transition-colors " +
    (isLive
      ? "live-card border-accent/40 hover:border-accent/60"
      : isSettled
        ? "opacity-95 hover:border-mute/40"
        : "hover:border-mute/40");

  const winner = isSettled
    ? data.players.find((p) => p.rank === 1) ?? null
    : null;

  return (
    <Link href={`/matches/${data.id}`} className={cardCls}>
      <Header data={data} />

      {(isLive || isUpcoming) && data.tickerItems.length > 0 && (
        <div className="mt-3">
          <HeaderTicker items={data.tickerItems} />
        </div>
      )}

      {isSettled && winner && (
        <ResultBand winner={winner} />
      )}

      <div className="mt-2 divide-y divide-border/60">
        {data.players.map((p) =>
          isLive ? (
            <PlayerRowLive
              key={p.id}
              player={p}
              totalHoles={data.totalHoles}
            />
          ) : isSettled ? (
            <PlayerRowSettled
              key={p.id}
              player={p}
              totalHoles={data.totalHoles}
              isWinner={p.rank === 1}
            />
          ) : (
            <PlayerRowUpcoming key={p.id} player={p} />
          ),
        )}
      </div>

      {(isLive || isUpcoming) && data.nextHole && (
        <div className="mt-3">
          <PeekHole
            next={data.nextHole}
            variant={isUpcoming ? "upcoming" : "live"}
          />
        </div>
      )}

      {isSettled && (
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-mute truncate">
            {data.totalHoles} holes
            {data.startingHole === 10 ? " · back" : ""}
            {data.wagerCount > 0 ? ` · ${data.wagerCount} wagers` : ""}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
            Recap →
          </span>
        </div>
      )}
    </Link>
  );
}

function Header({ data }: { data: MatchCardData }) {
  const formatted = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(data.scheduledAt);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-display text-base sm:text-[17px] font-semibold tracking-tight text-ink truncate">
          {data.courseName}
          <span className="text-mute font-normal ml-1.5 text-sm">
            ·{" "}
            {data.totalHoles === 9
              ? data.startingHole === 10
                ? "Back 9"
                : "Front 9"
              : "18"}
          </span>
        </div>
        <div className="font-mono text-[10.5px] text-mute uppercase tracking-wider mt-0.5">
          {formatted.toUpperCase()}
          {data.nextHole && data.status === "IN_PROGRESS" && (
            <>
              <span className="mx-1.5 text-faint">·</span>
              <span className="text-accent">
                Hole {data.nextHole.number} next
              </span>
              <span className="mx-1.5 text-faint">·</span>
              <span>P{data.nextHole.par}</span>
            </>
          )}
        </div>
      </div>
      <div className="shrink-0">
        <StatusPill status={data.status} scheduledAt={data.scheduledAt} />
      </div>
    </div>
  );
}

function ResultBand({ winner }: { winner: NonNullable<MatchCardData["players"][number]> }) {
  const netLabel =
    winner.netToPar === 0
      ? "E"
      : winner.netToPar > 0
        ? `+${winner.netToPar}`
        : `${winner.netToPar}`;
  return (
    <div className="mt-3 rounded-md border border-gold/30 bg-gold/[0.06] px-3 py-2 flex items-center justify-between gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-gold/80">
        Winner
      </span>
      <span className="font-medium text-sm text-ink truncate flex-1 text-center">
        {winner.name}
      </span>
      <span className="font-mono text-sm tabular-nums text-gold">
        {netLabel}
      </span>
    </div>
  );
}
