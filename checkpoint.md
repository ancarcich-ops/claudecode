# Sticks — checkpoint (2026-05-29)

Snapshot of where we are and what's next. Update this whenever a chunk
of work lands so it's quick to spin back up.

## Live URL
repo `ancarcich-ops/claudecode` (Vercel). Confirm the current production
domain in the Vercel project — DB + project have been reconnected since
the last checkpoint.

## Recently shipped (this session)

- **Real auth** (PRs #229, #230, #232)
  - Username **or** email + password login, open signup, forgot/reset
    password via Resend email
  - scrypt password hashing (`src/lib/password.ts`, no deps), session-
    token cookie auth (`src/lib/auth.ts`), 1-hr reset tokens
  - "The Clubhouse" login/signup/forgot/reset UI (`src/app/login/AuthForms.tsx`)
  - Signup trimmed to **Username + Email + Password** (Display name
    dropped from signup; still editable in Settings — app falls back to
    `displayName ?? username` everywhere)
  - Schema: `User.email` (unique, nullable@DB/required@app),
    `User.passwordHash`, new `PasswordResetToken` model
- **Group invite fix** (PR #234)
  - `/login` ↔ `/signup` links now carry `next`, so a new invitee who
    signs up from an invite link actually lands in the group (was
    dropping the join and showing the manual code form)
- **Edit a match before it starts** (PR #233)
  - "Edit details" in the ⋯ menu (creator-only, UPCOMING only) reopens
    the new-match wizard pre-filled; `editMatchAction` updates players
    **in place by seat** so wagers/odds on surviving seats survive
- **Start the round from the Prep screen** (PR #235)
  - On UPCOMING matches the "Start on-course GPS and scorecard" button
    now opens GPS *and* flips the match to live in one tap
- **GolfBert course imports** (Days 1–3, PRs incl. #231)
  - ~200 courses matched and written to the DB (`Course` / `CourseHole`
    / `CourseHazard`) with pars, tee/green coords, polygons, hazards
  - Import state tracked in `scripts/golfbert-state.json`; helper
    `scripts/list-unmatched.ts`
- **Maps confirmed working**
  - `NEXT_PUBLIC_MAPBOX_TOKEN` added → satellite imagery live on the
    ~160 mapped courses (2,699 / 2,790 holes mapped)

## Known data issue (in progress)

Some courses marked `dbImported: true` in `golfbert-state.json` have **0
holes** in the currently-connected DB — almost certainly because an
earlier import run wrote to a different database than the one now live.
Re-importing against the current DB restores them.

- **Alondra Park** → catalog `alondra-park`, GolfBert `--gb-id=1688`
- **Angeles National** → catalog `angeles-national`, GolfBert `--gb-id=2137`
- **Costa Mesa CC – Los Lagos** → catalog `costa-mesa-los-lagos`,
  **no-match** (needs its GolfBert id found)

Blocked today by a GolfBert **429 (their daily quota, exhausted by the
Day 1–3 sweeps)**. Re-run tomorrow once it resets:
```
node scripts/use-postgres.mjs && npx prisma generate
npx tsx scripts/import-golfbert.ts --id=alondra-park --gb-id=1688
npx tsx scripts/import-golfbert.ts --id=angeles-national --gb-id=2137
npx tsx scripts/import-golfbert.ts --id=costa-mesa-los-lagos --force
git checkout -- prisma/schema.prisma
```
**Critical:** local `.env` `DATABASE_URL` must match the live Vercel
Neon DB, or the re-import lands in the wrong place again.

## Env vars (Vercel)

| Name | Set? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres (Neon) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | yes (this session) | Satellite tiles — build-time, needs rebuild |
| `GOLFBERT_API_KEY` / `_ACCESS_KEY` / `_SECRET_KEY` | yes | GolfBert import (server only) |
| `BLOB_READ_WRITE_TOKEN` | check | Avatar uploads |
| `ADMIN_USERNAMES` | check | Comma-separated admin usernames |
| `RESEND_API_KEY` / `RESEND_FROM` / `APP_URL` | yes (this session) | Password-reset email |

`NEXT_PUBLIC_*` vars are baked at build time — changes require a
**rebuild without cache**.

## Backups (new this session)

- `.github/workflows/db-backup.yml` — daily `pg_dump` at 09:00 UTC,
  gzip artifact, 90-day retention. First run succeeded (~4.3 MB).
- Requires repo secret `BACKUP_DATABASE_URL` = **non-pooled** Neon URL
  (host without `-pooler`). Already set.

## Security — open

- **Rotate leaked keys.** GolfBert API/access/secret keys and the Neon
  password were pasted in plain chat. Rotate in GolfBert + Neon
  dashboards. Rotating Neon's password means updating **both**
  `DATABASE_URL` (Vercel) and `BACKUP_DATABASE_URL` (GitHub secret).

## Data-loss lesson (do not regress)

- `prisma db push --accept-data-loss` was removed from the build
  (`build:vercel`) — it once dropped prod user data. Keep it out.
- `scripts/reset-accounts.sql` (`TRUNCATE "User" … CASCADE`) wipes
  accounts + their matches/groups/wagers but **not** courses (no FK
  from course tables to User).
- Versioned migrations (`prisma migrate`) still deferred — worth doing
  to stop relying on `db push`.

## Next session — what to pick from

1. Re-import Alondra / Angeles / Costa Mesa (above) once GolfBert quota
   resets; find Los Lagos's GolfBert id.
2. Rotate the leaked keys + update Vercel/GitHub.
3. Versioned Prisma migrations instead of `db push`.
4. "Re-sync pars/coords from course" affordance for matches created
   before a course was (re)mapped.

## Operational notes

- Branch pattern: `claude/<feature>-<token>` (current:
  `claude/golfbert-client-setup-7Milj`)
- Workflow per change: edit → `npx tsc --noEmit` (+ `npx next build` for
  bigger changes) → commit → push → GitHub PR → squash merge → re-sync
  the working branch onto main (squash breaks fast-forward)
- Restricted to repo `ancarcich-ops/claudecode`
- GitHub ops via the GitHub MCP tools (no `gh` CLI in this env)
