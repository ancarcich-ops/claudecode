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

1. **Create a Supabase project** (free tier is plenty). Wait for it to finish
   provisioning.
2. In Supabase, click **Connect** (top bar) → **ORMs → Prisma**. It shows a
   `DATABASE_URL` (pooler, port `6543`) and a `DIRECT_URL` (direct, port
   `5432`). Copy both; swap `[YOUR-PASSWORD]` for your project's DB password.
3. **Import this repo into Vercel** (New Project → pick `claudecode`). It
   auto-detects Next.js; the build is wired via `vercel.json` →
   `npm run build:vercel`, which swaps Prisma to Postgres and runs
   `prisma db push` to create the tables.
4. Since the app lives on a feature branch, set Vercel → **Settings → Git →
   Production Branch** to `claude/pregnancy-craving-tracker-Gvv63` (this keeps
   the unrelated `main` app out of it).
5. In Vercel → **Settings → Environment Variables**, add both:
   - `DATABASE_URL` = the pooler URL from step 2
   - `DIRECT_URL` = the direct URL from step 2
6. **(Optional) Photos:** Vercel → **Storage → Blob** → create a store. The
   `BLOB_READ_WRITE_TOKEN` is injected automatically and the photo upload
   field appears. Without it, everything else works fine.
7. **Deploy.** Open the URL on both phones → **Share → Add to Home Screen**.
8. The due date is pre-set to Jan 29, 2027; adjust it (and names / baby
   nickname) any time in the app's **Settings**.

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
