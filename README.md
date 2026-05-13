# Fairway Market

A Polymarket-style prediction market for golf rounds. Players post upcoming
rounds (course, tee time, handicaps), friends "call" who wins, and odds move
like a market — driven by a hybrid of the handicap prior, the crowd's calls,
and (once play starts) live scoring.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** for styling
- **Prisma** + **SQLite** for persistence (one file, `prisma/dev.db`)
- **Recharts** for the odds chart
- Cookie-based username sessions (no passwords)

## Getting started

```bash
cp .env.example .env
npm install
npm run db:push   # create the SQLite schema
npm run db:seed   # demo users + a live and upcoming match
npm run dev
```

Then open <http://localhost:3000>.

## How the odds work

For each match we produce a probability over the players, blending three
signals:

1. **Model prior** — softmax over negative handicap (lower hcp = favored).
2. **Crowd** — Laplace-smoothed share of friend wagers.
3. **Live** — projects each player's final net score from their current pace
   and softmaxes over `-net`, getting more confident as more holes are played.

Blend weights shift with information:

| Status        | Model           | Crowd                              | Live                |
| ------------- | --------------- | ---------------------------------- | ------------------- |
| Upcoming      | 1 − crowd       | `w / (w + 5)`, capped at 0.7       | 0                   |
| In progress   | remainder       | remainder × `w / (w + 4)`, ≤ 0.7   | `holesPlayed/holes` |
| Completed     | 0               | 0                                  | 1 (winner = lowest net) |

Every wager and every score entry writes an `OddsSnapshot` row, so the chart
on the match page is a real history, not synthetic.

## Project layout

```
prisma/
  schema.prisma          # User, Match, MatchPlayer, Wager, ScoreEntry, OddsSnapshot
  seed.ts                # demo data
src/
  lib/
    db.ts                # singleton PrismaClient
    auth.ts              # cookie session helpers
    odds.ts              # the hybrid odds engine
    match.ts             # loadMatchWithOdds + snapshot recorder
    actions.ts           # server actions (create/wager/start/log/complete)
    colors.ts            # per-seat palette
  app/
    layout.tsx           # header + footer shell
    page.tsx             # market grid (upcoming + live, then settled)
    login/               # username-only sign-in
    matches/new/         # match creation form (client)
    matches/[id]/        # match detail: OddsChart, WagerForm, ScoreSheet
```

## What's intentionally out of scope (yet)

- Real auth — anyone can claim any username.
- Websockets / SSE — the page revalidates on action, no auto-refresh.
- Course database — course is just a free-text field.
- Mobile-tuned scoring UI — works on phones, but not yet optimized.
