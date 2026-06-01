// Shared domain types for the Braves minor-league tracker.

export type Level = 'AAA' | 'AA' | 'High-A' | 'Low-A' | 'Rookie' | 'DSL';

export interface Affiliate {
  teamId: number;
  name: string;
  level: Level;
  sportId: number;
}

export type GameState = 'scheduled' | 'live' | 'final' | 'other';

export interface GameSide {
  name: string;
  abbreviation: string;
  runs: number | null;
  isBraves: boolean;
}

export interface Game {
  gamePk: number;
  state: GameState;
  detailedState: string;
  startTimeUTC: string | null;
  /** e.g. "Top 7", "Bot 3", "F", "F/10". Empty for scheduled games. */
  inning: string;
  level: Level;
  affiliateName: string;
  home: GameSide;
  away: GameSide;
}

export interface Scoreboard {
  date: string; // YYYY-MM-DD
  games: Game[];
  /** True when the data came from the offline mock instead of the live API. */
  isMock: boolean;
}
