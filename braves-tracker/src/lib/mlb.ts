import type { Affiliate, Game, GameSide, GameState, Level, Scoreboard } from './types';
import { mockScoreboard } from './mock';

// MLB's public Stats API. No key required. Covers every minor-league level.
const BASE = 'https://statsapi.mlb.com/api/v1';

// Atlanta Braves parent organization id in the Stats API.
const BRAVES_ORG_ID = 144;

// Minor-league sportIds we care about. The API uses these to separate levels.
//   11 = Triple-A, 12 = Double-A, 13 = High-A, 14 = Low-A, 16 = Rookie (incl. DSL)
const MINOR_SPORT_IDS = [11, 12, 13, 14, 16];

function levelForSport(sportId: number, teamName: string): Level {
  if (sportId === 11) return 'AAA';
  if (sportId === 12) return 'AA';
  if (sportId === 13) return 'High-A';
  if (sportId === 14) return 'Low-A';
  // Rookie ball: separate domestic complex (FCL) from the Dominican Summer League.
  if (/\bDSL\b|Dominican/i.test(teamName)) return 'DSL';
  return 'Rookie';
}

const LEVEL_ORDER: Level[] = ['AAA', 'AA', 'High-A', 'Low-A', 'Rookie', 'DSL'];

export function compareByLevel(a: { level: Level }, b: { level: Level }): number {
  return LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
}

const useMock = () => process.env.USE_MOCK_DATA === '1';
const season = () => process.env.SEASON || String(new Date().getUTCFullYear());

async function getJSON<T>(url: string): Promise<T> {
  // Revalidate hourly; scores pages override with a shorter window.
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`MLB API ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

/**
 * Resolve the Braves' current minor-league affiliates dynamically from the
 * API rather than hardcoding team ids that shift with relocations/rebrands
 * (e.g. Mississippi Braves -> Columbus Clingstones, Rome Braves -> Emperors).
 */
export async function getAffiliates(): Promise<Affiliate[]> {
  const url = `${BASE}/teams/affiliates?teamIds=${BRAVES_ORG_ID}&season=${season()}`;
  const data = await getJSON<{ teams: any[] }>(url);
  const affiliates: Affiliate[] = (data.teams || [])
    .filter((t) => MINOR_SPORT_IDS.includes(t.sport?.id))
    .map((t) => ({
      teamId: t.id,
      name: t.name as string,
      sportId: t.sport.id as number,
      level: levelForSport(t.sport.id, t.name),
    }));
  return affiliates.sort(compareByLevel);
}

function classifyState(abstract: string): GameState {
  switch (abstract) {
    case 'Preview':
      return 'scheduled';
    case 'Live':
      return 'live';
    case 'Final':
      return 'final';
    default:
      return 'other';
  }
}

function inningLabel(linescore: any, state: GameState): string {
  if (state === 'final') {
    const innings = linescore?.currentInning;
    return innings && innings !== 9 ? `F/${innings}` : 'F';
  }
  if (state === 'live' && linescore?.currentInning) {
    const half = linescore.isTopInning ? 'Top' : 'Bot';
    return `${half} ${linescore.currentInningOrdinal || linescore.currentInning}`;
  }
  return '';
}

function side(teamNode: any, isBraves: boolean): GameSide {
  return {
    name: teamNode?.team?.name ?? 'TBD',
    abbreviation: teamNode?.team?.abbreviation ?? '',
    runs: typeof teamNode?.score === 'number' ? teamNode.score : null,
    isBraves,
  };
}

/** Today's (or a given date's) games across every Braves affiliate. */
export async function getScoreboard(date: string): Promise<Scoreboard> {
  if (useMock()) return mockScoreboard(date);

  try {
    const affiliates = await getAffiliates();
    const byId = new Map(affiliates.map((a) => [a.teamId, a]));
    const teamIds = affiliates.map((a) => a.teamId).join(',');
    const sportIds = MINOR_SPORT_IDS.join(',');

    const url =
      `${BASE}/schedule?sportId=${sportIds}&teamId=${teamIds}` +
      `&date=${date}&hydrate=linescore,team`;
    const data = await getJSON<{ dates: { games: any[] }[] }>(url);

    const games: Game[] = [];
    for (const day of data.dates || []) {
      for (const g of day.games || []) {
        const homeIsBraves = byId.has(g.teams?.home?.team?.id);
        const awayIsBraves = byId.has(g.teams?.away?.team?.id);
        const affiliate = byId.get(g.teams?.home?.team?.id) ?? byId.get(g.teams?.away?.team?.id);
        if (!affiliate) continue; // not one of our clubs

        const state = classifyState(g.status?.abstractGameState);
        games.push({
          gamePk: g.gamePk,
          state,
          detailedState: g.status?.detailedState ?? '',
          startTimeUTC: g.gameDate ?? null,
          inning: inningLabel(g.linescore, state),
          level: affiliate.level,
          affiliateName: affiliate.name,
          home: side(g.teams?.home, homeIsBraves),
          away: side(g.teams?.away, awayIsBraves),
        });
      }
    }
    games.sort(compareByLevel);
    return { date, games, isMock: false };
  } catch (err) {
    // Network-restricted env or API hiccup: degrade to mock so the UI still renders.
    console.error('[mlb] falling back to mock scoreboard:', err);
    return mockScoreboard(date);
  }
}
