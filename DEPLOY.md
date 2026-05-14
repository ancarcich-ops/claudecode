# Deploying Sticks

Two-step deploy: stand up a free hosted Postgres (Neon), then point Vercel
at your GitHub repo. About 10 minutes end-to-end.

## 1. Create a hosted Postgres

The fastest free option is **Neon** (<https://neon.tech>). Vercel Postgres
and Supabase both work the same way.

1. Sign up, create a new project. Name doesn't matter.
2. After creation, Neon shows a **connection string** like:

       postgresql://USER:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require

   Copy it — that's your `DATABASE_URL`.

## 2. Deploy to Vercel

1. Push this repo to GitHub (already done if you've been following along).
2. Go to <https://vercel.com/new>, click **Import Git Repository**, pick
   the `claudecode` repo.
3. In the import screen, set these:

   | Setting             | Value                          |
   | ------------------- | ------------------------------ |
   | Framework Preset    | Next.js (autodetected)         |
   | **Build Command**   | `npm run build:vercel`         |
   | Install Command     | (leave default)                |
   | Output Directory    | (leave default)                |
   | Environment Variables | add `DATABASE_URL` = your Neon string |

   The `build:vercel` script swaps in the Postgres schema, runs
   `prisma db push` against your Neon database to create the tables, then
   builds Next.js. You don't need to run any migration locally.

4. Click **Deploy**. First build takes ~2 minutes.

When it's done, Vercel gives you a URL like `sticks.vercel.app` (whatever
you named your Vercel project).

## 3. (Optional) Seed your production database

Once tables exist on Neon, you can seed from your laptop:

```powershell
# In a separate PowerShell window
$env:DATABASE_URL = "postgresql://...your neon string..."
npm run use:postgres   # swaps schema locally too
npx prisma generate
npm run db:seed
```

Then switch back to SQLite for local dev:

```powershell
git checkout prisma/schema.prisma
npx prisma generate
```

(Or just don't seed prod and let real users create real matches.)

## 4. (Optional) Custom domain

In Vercel → your project → **Settings** → **Domains**, add your domain.
Vercel handles the SSL cert automatically.

## What about local SQLite?

The repo keeps `prisma/schema.prisma` set to **sqlite** for zero-config
local dev. The Postgres variant lives in `prisma/schema.postgres.prisma`
and only gets swapped in by `npm run build:vercel` during a Vercel build,
so your local `dev.db` keeps working.

If you ever want to point local dev at Neon too:

```powershell
npm run use:postgres
# edit .env to set DATABASE_URL to your Neon connection string
npm run db:push
```

To go back to SQLite: `git checkout prisma/schema.prisma` and reset
`.env` to `DATABASE_URL="file:./dev.db"`.

## Troubleshooting

- **`build:vercel` fails with "no migration provider"** — make sure the
  `DATABASE_URL` environment variable is set in Vercel and points at a
  reachable Postgres.
- **Tables exist but app errors with "column does not exist"** — schema
  drifted. Re-run `npx prisma db push` against the production URL from
  your laptop.
- **Cookies don't stick on production** — Next.js sets HTTP-only cookies
  on the production domain automatically. If you're embedding in an iframe
  or testing across subdomains, you may need to widen the cookie scope in
  `src/lib/auth.ts`.
- **Cold starts feel slow** — Neon's free tier suspends the database
  after inactivity. The first request after a quiet period wakes it (~1s).
  Upgrade Neon tier or use Vercel Postgres if this matters.

## Cost

Free tier on both Vercel and Neon will cover dozens of friends posting a
few rounds a week, comfortably. You'll only ever pay if this catches on.
