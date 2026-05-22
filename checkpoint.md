# Sticks — checkpoint (2026-05-22)

Snapshot of where we are and what's next. Update this whenever a chunk
of work lands so it's quick to spin back up.

## Live URL
sticks-golf.vercel.app · repo ancarcich-ops/claudecode

## Recently shipped (this session)

- **GolfBert integration** (PRs #117–#128)
  - Typed AWS-SigV4 client (`src/lib/golfbert.ts`) — credentials in
    server env only, never bundled
  - Admin GolfBert panel on `/admin/courses/[name]` — Test connection,
    Look up id, Search by name, Import-by-id (works on single-course
    plans where catalog search returns empty)
  - Import writes greens, fairways, tees, hazards, polygons + per-hole
    par/yardage into `Course` + `CourseHole` + `CourseHazard`
  - **Resilience fixes** found by importing Riverbend:
    - `parsePolygon` accepts both `[[lat,lng],…]` and `[{lat,lng},…]`
      (the importer writes the object form; was being silently dropped)
    - Tee fallback: when teeboxes ship no `coordinates`, pick the
      candidate point (range.start/end + vector vertices) farthest
      from green centroid, with a ≥50y sanity check
    - `pickPar` takes mode across teeboxes + yardage-based override
      (par 3 above ~290y or par 5 below ~440y gets re-bucketed)
    - Hazards wiped before re-import — prior code duplicated on every
      re-run
- **Admin: course editor polish**
  - Rename mechanism — `adminRenameCourseAction` updates `Course.name`
    + propagates to existing `Match.courseName`
  - GPS-free per-hole preview at `/admin/courses/[name]/preview`
  - "Preview holes" + "Rename" links wired into the editor header
  - "Open course by name" input on `/admin/courses` so unmapped
    courses can be created on the fly
- **Match: Preview mode** (`HoleStudyMode.tsx`, PRs #123, #124, #128,
  #129)
  - Pre-round entry point that mirrors on-course chrome (hole picker,
    sub-header, wind dial, satellite canvas) but anchors at the tee
    instead of GPS
  - Front/Center/Back distance card + per-hazard chip row
  - **Tap-to-aim** drops an AIM pin and swaps the card to
    To-aim / To-pin / Carry. Per-hole; resets on hole change.
  - Hazard markers labels-only (no colored circles cluttering the
    satellite)
  - On-course launcher is suppressed when match status is `UPCOMING`
    so Preview is the only pre-round entry point
- **Course catalog**
  - Riverbend Golf Complex (Kent, WA) added under new `PNW` region —
    GolfBert's default sample course on a Single Course Plan
  - `COURSE_PRESET_COORDS` map seeds clubhouse lat/lng for all 63
    presets so "Find course near me" can rank the full catalog
- **New match: Find course near me** (PRs #130, #131)
  - Geolocation-driven autosuggest on `/matches/new`
  - `findClosestCoursesAction` merges preset coords with Course-table
    rows; DB rows win on name collision

## Env vars (Vercel)

| Name | Where set | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | All envs | Postgres (Neon/Vercel) |
| `BLOB_READ_WRITE_TOKEN` | All envs | Avatar uploads |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | All envs | Satellite tiles |
| `ADMIN_USERNAMES` | Production+ | Comma-separated admin usernames |
| `GOLFBERT_API_KEY` | All envs | GolfBert `x-api-key` header |
| `GOLFBERT_ACCESS_KEY` | All envs | AWS SigV4 access key id |
| `GOLFBERT_SECRET_KEY` | All envs | AWS SigV4 secret access key |

NEXT_PUBLIC_* vars are baked at build time — adding/changing requires
a **rebuild without cache** (or push any commit).

## In flight / parked

- **Subscription scope.** Currently on a GolfBert Single Course Plan
  (Riverbend). To import another home course (Los Verdes, Costa Mesa,
  etc.) email GolfBert to switch the assigned course, then re-import.
  No code change needed.
- **`source` column on `CourseHazard`.** Re-import currently wipes
  every hazard for the course (idempotency wins). Add a `source`
  column so `golfbert` vs `user` hazards can co-exist when users
  start hand-marking.
- **Preset coordinate accuracy.** Backfilled rough clubhouse coords
  (~10m) for all 63 SoCal/OC/IE presets + Riverbend. Spot-check from
  known locations and refine if any rank weirdly.
- **Match pars don't auto-sync from Course.** Re-import propagates
  pars only to `UPCOMING` matches. In-progress / completed rounds
  keep whatever they were created with — by design, but worth a
  "Re-sync from course" button for the edge case.
- **Per-hole stroke index storage.** GolfBert exposes
  `teebox.handicap` and the typed client already pulls it, but no
  `CourseHole.handicap` column exists yet. Add when we want
  handicap-aware net scoring at specific holes.

## Next session — what to pick from

1. Real-time notifications (#6 from prior list). Needs Upstash /
   Supabase pub-sub. Deferred again.
2. Per-hole stroke index — schema column + GolfBert hookup +
   net-scoring usage.
3. Hazard `source` column + admin "edit hazards" affordance so
   user-marked overrides survive a re-import.
4. OSM fallback in the GolfBert panel — `osm.ts` exists; trigger
   it for courses without a GolfBert subscription so they're not
   blocked from the preview/on-course experience.

## Operational notes

- Branch pattern: `claude/<feature>-<token>` (current:
  `claude/golfbert-client-setup-7Milj`)
- Workflow per change: edit → `npx tsc --noEmit` → commit → push →
  GitHub PR → squash merge → rebase locally onto main if more work
  follows on the same branch (squash-merge breaks fast-forward)
- Restricted to repo `ancarcich-ops/claudecode`
- Vercel rebuild required after env var changes (uncheck "use
  existing build cache")
