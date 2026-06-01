import type { Game, Scoreboard } from './types';

// Offline / fallback dataset. Lets the UI render in network-restricted
// sandboxes and during local dev without hitting the live MLB Stats API.
// Values are illustrative, not real results.

function game(g: Partial<Game> & Pick<Game, 'gamePk' | 'level' | 'affiliateName' | 'home' | 'away'>): Game {
  return {
    state: 'final',
    detailedState: 'Final',
    startTimeUTC: null,
    inning: 'F',
    ...g,
  };
}

export function mockScoreboard(date: string): Scoreboard {
  const games: Game[] = [
    game({
      gamePk: 900001,
      level: 'AAA',
      affiliateName: 'Gwinnett Stripers',
      home: { name: 'Gwinnett Stripers', abbreviation: 'GWN', runs: 6, isBraves: true },
      away: { name: 'Durham Bulls', abbreviation: 'DUR', runs: 4, isBraves: false },
    }),
    {
      gamePk: 900002,
      state: 'live',
      detailedState: 'In Progress',
      startTimeUTC: null,
      inning: 'Top 7',
      level: 'AA',
      affiliateName: 'Columbus Clingstones',
      home: { name: 'Columbus Clingstones', abbreviation: 'COL', runs: 2, isBraves: true },
      away: { name: 'Biloxi Shuckers', abbreviation: 'BLX', runs: 3, isBraves: false },
    },
    game({
      gamePk: 900003,
      level: 'High-A',
      affiliateName: 'Rome Emperors',
      home: { name: 'Greensboro Grasshoppers', abbreviation: 'GBO', runs: 1, isBraves: false },
      away: { name: 'Rome Emperors', abbreviation: 'ROM', runs: 5, isBraves: true },
    }),
    {
      gamePk: 900004,
      state: 'scheduled',
      detailedState: 'Scheduled',
      startTimeUTC: `${date}T23:05:00Z`,
      inning: '',
      level: 'Low-A',
      affiliateName: 'Augusta GreenJackets',
      home: { name: 'Augusta GreenJackets', abbreviation: 'AUG', runs: null, isBraves: true },
      away: { name: 'Charleston RiverDogs', abbreviation: 'CHS', runs: null, isBraves: false },
    },
    game({
      gamePk: 900005,
      level: 'Rookie',
      affiliateName: 'FCL Braves',
      home: { name: 'FCL Braves', abbreviation: 'ATL', runs: 8, isBraves: true },
      away: { name: 'FCL Phillies', abbreviation: 'PHI', runs: 7, isBraves: false },
    }),
  ];

  return { date, games, isMock: true };
}
