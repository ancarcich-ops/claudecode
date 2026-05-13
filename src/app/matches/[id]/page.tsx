import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadMatchWithOdds } from "@/lib/match";
import {
  completeMatchAction,
  deleteMatchAction,
  placeWagerAction,
  reopenMatchAction,
  startMatchAction,
  updateHandicapAction,
  updateParsAction,
} from "@/lib/actions";
import { formatPct } from "@/lib/odds";
import { colorForSeat } from "@/lib/colors";
import AutoRefresh from "@/components/AutoRefresh";
import OddsChart from "./OddsChart";
import ScoreSheet from "./ScoreSheet";
import WagerForm from "./WagerForm";
import ParsEditor from "./ParsEditor";
import HandicapInput from "./HandicapInput";

export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  const loaded = await loadMatchWithOdds(params.id);
  if (!loaded) notFound();
  const { match, odds, pars } = loaded;

  const myWager = user
    ? match.wagers.find((w) => w.userId === user.id) ?? null
    : null;
  const isCreator = !!user && match.createdById === user.id;
  const isCompleted = match.status === "COMPLETED";

  type Row = { t: number } & Record<string, number>;
  const rowMap = new Map<number, Row>();
  for (const snap of match.oddsSnapshots) {
    const t = snap.createdAt.getTime();
    const row = rowMap.get(t) ?? ({ t } as Row);
    row[snap.matchPlayerId] = snap.probability;
    rowMap.set(t, row);
  }
  const series = Array.from(rowMap.values()).sort((a, b) => a.t - b.t);
  if (series.length > 0) {
    const last: Row = { t: Date.now() } as Row;
    for (const p of match.players) last[p.id] = odds.probabilities[p.id] ?? 0;
    series.push(last);
  }

  const wagerCounts: Record<string, number> = {};
  for (const w of match.wagers) {
    wagerCounts[w.pickedPlayerId] = (wagerCounts[w.pickedPlayerId] ?? 0) + 1;
  }

  const playerMeta = match.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    displayName: p.displayName,
    handicap: p.handicap,
    color: colorForSeat(p.seat),
    wagerCount: wagerCounts[p.id] ?? 0,
    probability: odds.probabilities[p.id] ?? 0,
    netScore: odds.meta.netScores[p.id] ?? null,
    scores: p.scores.slice().sort((a, b) => a.hole - b.hole),
  }));

  return (
    <div className="space-y-6">
      <AutoRefresh endpoint={`/api/matches/${match.id}/state`} />

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {match.courseName}
          </h1>
          <div className="text-sm text-mute mt-1">
            {new Date(match.scheduledAt).toLocaleString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {" · "}
            {match.holes} holes · par {odds.meta.coursePar}
            {" · "}
            posted by @{match.createdBy.username}
          </div>
          {match.notes && (
            <div className="text-sm text-mute mt-2 italic">
              &ldquo;{match.notes}&rdquo;
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={match.status} />
          {isCreator && match.status === "UPCOMING" && (
            <form action={startMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <button className="btn btn-ghost">Start round</button>
            </form>
          )}
          {isCreator && match.status === "IN_PROGRESS" && (
            <form action={completeMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <button className="btn btn-ghost">Mark final</button>
            </form>
          )}
          {isCreator && match.status !== "UPCOMING" && (
            <form action={reopenMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <button className="btn btn-ghost">Reopen</button>
            </form>
          )}
          {isCreator && (
            <form action={deleteMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <button className="btn btn-danger">Delete</button>
            </form>
          )}
        </div>
      </header>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wider text-mute">
            Market
          </h2>
          <div className="text-xs text-mute font-mono">
            model {(odds.weights.model * 100).toFixed(0)}% · crowd{" "}
            {(odds.weights.crowd * 100).toFixed(0)}% · live{" "}
            {(odds.weights.live * 100).toFixed(0)}%
          </div>
        </div>

        <OddsChart
          series={series}
          players={playerMeta.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            color: p.color,
          }))}
        />

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {playerMeta.map((p) => (
            <div key={p.id} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: p.color }}
                  />
                  <span className="font-medium truncate">{p.displayName}</span>
                  {isCreator ? (
                    <HandicapInput
                      action={updateHandicapAction}
                      matchId={match.id}
                      matchPlayerId={p.id}
                      handicap={p.handicap}
                    />
                  ) : (
                    <span className="chip">hcp {p.handicap}</span>
                  )}
                </div>
                <div className="font-mono tabular-nums text-lg">
                  {formatPct(p.probability)}
                </div>
              </div>
              <div className="h-1.5 mt-2 bg-panel2 rounded-full overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${p.probability * 100}%`,
                    background: p.color,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-mute">
                <span>
                  {p.wagerCount} wager{p.wagerCount === 1 ? "" : "s"}
                </span>
                {p.netScore !== null && (
                  <span className="font-mono">
                    proj net {p.netScore.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm uppercase tracking-wider text-mute mb-3">
          Place your call
        </h2>
        {!user ? (
          <div className="text-sm text-mute">
            <a className="text-accent" href="/login">
              Sign in
            </a>{" "}
            to place a call on this match.
          </div>
        ) : isCompleted ? (
          <div className="text-sm text-mute">
            Market closed. {myWager ? "Your final call is locked in." : ""}
          </div>
        ) : (
          <WagerForm
            action={placeWagerAction}
            matchId={match.id}
            players={playerMeta}
            currentPickId={myWager?.pickedPlayerId ?? null}
          />
        )}
        {match.wagers.length > 0 && (
          <div className="mt-4 text-xs text-mute">
            <span className="uppercase tracking-wider">Recent calls:</span>{" "}
            {match.wagers
              .slice(-8)
              .reverse()
              .map((w) => (
                <span key={w.id} className="mr-2">
                  @{w.user.username} → {w.pickedPlayer.displayName}
                </span>
              ))}
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wider text-mute">
            Scorecard
          </h2>
          <span className="text-xs text-mute">
            {odds.meta.holesPlayed}/{match.holes} holes logged
          </span>
        </div>
        {!user ? (
          <div className="text-sm text-mute">
            Sign in to log scores during the round.
          </div>
        ) : (
          <ScoreSheet
            matchId={match.id}
            holes={match.holes}
            pars={pars}
            players={playerMeta}
            locked={isCompleted}
          />
        )}
      </section>

      {isCreator && (
        <section className="card p-4">
          <ParsEditor
            action={updateParsAction}
            matchId={match.id}
            holes={match.holes}
            pars={pars}
          />
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    UPCOMING: "bg-panel2 text-mute border border-border",
    IN_PROGRESS: "bg-accent/15 text-accent border border-accent/30",
    COMPLETED: "bg-gold/10 text-gold border border-gold/30",
  };
  const label: Record<string, string> = {
    UPCOMING: "Upcoming",
    IN_PROGRESS: "Live",
    COMPLETED: "Final",
  };
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full ${map[status] ?? ""}`}
    >
      {label[status] ?? status}
    </span>
  );
}
