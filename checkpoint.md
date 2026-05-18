# Sticks — checkpoint (2026-05-18)

Snapshot of where we are and what's next. Update this whenever a chunk
of work lands so it's quick to spin back up.

## Live URL
sticks-golf.vercel.app · repo ancarcich-ops/claudecode

## Recently shipped (last session)

- **On-course GPS rangefinder**
  - Distance rail (Garmin-style) with carry/layup yardages
  - Tap-to-aim on the mini-map
  - Walk-based auto-advance to next hole (toast + Undo)
  - Mapbox satellite base layer (token in `NEXT_PUBLIC_MAPBOX_TOKEN`)
  - Map redesigned as the hero element — fills the on-course screen
  - Satellite renders even on unmapped holes (synthetic 160m bbox)
  - Aspect-aware bbox + viewBox — no letterbox bars
- **Course catalog**
  - Bighorn GC – Canyons + Mountains (Palm Desert) added
  - `scripts/seed-bighorn.ts` seeds both courses' pars in prod
- **Admin section** (`/admin`, gated by `ADMIN_USERNAMES` env var)
  - `/admin/courses/[name]` — drop tee/green pins on satellite,
    auto-advances target through 18 holes
  - `/admin/matches` — force-delete sloppy / abandoned matches

## Env vars (Vercel)

| Name | Where set | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | All envs | Postgres (Neon/Vercel) |
| `BLOB_READ_WRITE_TOKEN` | All envs | Avatar uploads |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | All envs | Satellite tiles |
| `ADMIN_USERNAMES` | Production+ | Comma-separated admin usernames |

NEXT_PUBLIC_* vars are baked at build time — adding/changing requires
a **rebuild without cache** (or push any commit).

## In flight / parked

- **#3 Real course-data provider.** Need to evaluate GolfBert,
  iSportsGenius/iGolf, GolfNow/NBC Sports Next. Pricing not public on
  most — email outreach required.
- **Real-time notifications (#6 from prior list).** Deferred —
  needs Upstash/Supabase pub-sub.
- **Per-hole stroke index storage.** Bighorn seed logs men's HCP but
  there's no `CourseHole.handicap` column yet. Add when we want
  handicap-aware net scoring at specific holes.
- **Stale "Bighorn Golf Club" Course row in local dev DB.** Harmless,
  but if it ever ships to prod it'd shadow the new Canyons/Mountains
  rows.

## Next session — what to pick from

1. Wire up #3 provider integration. Define the adapter interface so
   we can swap providers without touching the on-course screen.
2. Map out the user's "home courses" with the new admin editor
   (Los Verdes, Costa Mesa, Torrey Pines, Bighorn) so the GPS
   experience is real, not user-marked.
3. Real-time notifications (PR-event-style) for live-match score
   updates.

## Operational notes

- Branch pattern: `claude/<feature>-IXRSq`
- Workflow per change: edit → `npm run build` → commit → push →
  GitHub PR → squash merge
- Restricted to repo `ancarcich-ops/claudecode`
