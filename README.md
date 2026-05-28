# Bloom 🌸

A sweet, playful tracker for Geena's pregnancy cravings — built so **both**
of you can log from your phones. Track what she's craving, how intense it is,
the foods she now can't stand, the gloriously weird combos, who came through
to satisfy each craving, and how it all trends by week and trimester.

Themed soft blush-pink-and-cream for a baby girl 💕 (with a cozy "Dusk" dark
mode for those 3 a.m. cravings).

## Features

- **Quick craving log** — food, category, 1–5 ❤️ intensity, optional photo &
  notes, stamped with the pregnancy week/trimester automatically.
- **Foods Hated** — a running no-fly list of aversions with a 🤢 severity.
- **Wild Combos hall of fame** — flag the bizarre ones and rate them ⭐.
- **Trends** — category breakdown, most-craved foods, cravings over time, and
  a by-trimester chart.
- **"Did Daddy deliver?" scoreboard** — tracks who satisfied each craving.
- **Weekly recap card** — a pretty, shareable summary to text to family.
- **Baby fruit size** — "this week baby is the size of a 🍓" per week.
- **Two-person, no passwords** — tap your name up top to log as Geena or
  Daddy. Whoever has the link can add. Installable to your home screen (PWA).

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind**
- **Prisma** ORM — SQLite locally, **Supabase Postgres** in production
- **Recharts** (trends), **framer-motion** + **canvas-confetti** (the fun)
- **Vercel Blob** for optional craving photos

## Run it locally

```bash
cp .env.example .env     # DATABASE_URL defaults to local SQLite
npm install
npm run db:push          # create the SQLite schema (prisma/dev.db)
npm run db:seed          # optional: fun demo cravings to look at
npm run dev              # http://localhost:3000
```

## Deploy (Vercel + Supabase)

1. **Create a Supabase project** (free tier is plenty).
2. In Supabase → **Project Settings → Database → Connection string → URI**,
   copy the **Connection pooling** (port `6543`) string. Append
   `?pgbouncer=true&connection_limit=1` for serverless.
3. **Import this repo into Vercel.** It auto-detects Next.js; the build is
   already wired (`vercel.json` → `npm run build:vercel`, which swaps Prisma
   to the Postgres schema and runs `prisma db push` to create the tables).
4. In Vercel → **Settings → Environment Variables**, add:
   - `DATABASE_URL` = the Supabase pooling URL from step 2.
5. **(Optional) Photos:** Vercel → **Storage → Blob** → create a store. This
   injects `BLOB_READ_WRITE_TOKEN` automatically and the photo upload field
   appears. Without it, everything else works fine.
6. Deploy. Open the URL on both phones → **Share → Add to Home Screen**.
7. Open **Settings** in the app and set Geena's **due date** (and names /
   baby nickname). That powers the week, trimester, and fruit-size tracker.

## Project layout

```
prisma/
  schema.prisma           # SQLite (local dev)
  schema.postgres.prisma  # Postgres (Supabase / prod) — swapped in at build
  seed.ts                 # demo data (local only)
src/
  lib/
    db.ts            # PrismaClient singleton
    actions.ts       # server actions (add/satisfy/star/delete/settings)
    pregnancy.ts     # due date → week / trimester / progress
    fruit.ts         # week → "size of a ___" produce chart
    categories.ts    # craving categories (emoji + chart colors)
    identity.ts      # cookie-based "who's logging" (no passwords)
    settings.ts      # the single Settings row
  components/        # cards, forms, charts, tab bar, hero, etc.
  app/
    page.tsx         # dashboard
    log/             # log a craving
    cravings/        # full list + filters
    hated/           # Foods Hated
    wild/            # Wild Combos hall of fame
    trends/          # charts
    recap/           # shareable weekly card
    settings/        # due date, names, theme
```
