# Sticks — checkpoint (2026-07-04)

Snapshot of where we are and what's next. Update this whenever a chunk
of work lands so it's quick to spin back up.

## Live URL
https://sticks-golf.vercel.app (repo `ancarcich-ops/claudecode`, Vercel,
Neon Postgres). Mobile API base: `https://sticks-golf.vercel.app/api/mobile`.

## Recently shipped (this session)

### Tee-data saga — CLOSED (PRs #412–#418, #420s-era scripts, #427–#433, #435–#436)
- Audit flags **19,806 → 765** across 1,239 courses (96% reduction)
- Fix pipeline, in order: distance backfill from fairway projection
  (`scripts/recompute-tee-from-fairway.ts`, 13,783 tees), OSM surveyed
  positions (`scripts/recompute-tee-from-osm.ts`, **8,024 tees across
  862 courses** — routing score + angular ambiguity + stability rule),
  Overpass/DB retry hardening
- Trump National validated 18/18 correct on satellite
- Remaining tail (~318 courses with no OSM tees, 246 ambiguous holes)
  is owned by the **FIX TEE crowdfix**: on-course button (web +
  iOS) that sets the tee from the player's GPS, server-gated by
  accuracy ≤35y + plausibility vs scorecard distance (max(30y, 15%))
- Import-time sanity check tightened in `src/lib/golfbert.ts` (moot-ish:
  Golfbert subscription cancelled; OSM + crowdfix are the data sources now)
- Diagnostics kept: `audit-tee-boxes.ts`, `check-tees-vs-osm-boundary.ts`,
  `dump-course-geom.ts`, `export-all-hole-geom.ts`, caches in `scripts/*.json`

### Side games & scoring fixes (PRs #419–#421, #424–#425, #439)
- Standings switcher shows **every** enabled game (Wolf/Snake/BBB/
  Match/Sixes added); side-game tabs show only the game score
- Side-game event EDITORS restored on the scorecard (were orphaned
  when the old tab was removed) — Snake/Wolf entry works again
- Wolf: 3-player partner selection enabled, Pre-Lone (2x) removed,
  2v1 team win pays 1 each (4p stays 2 each)
- Clear-score button in the web score picker (server always supported it)

### Mobile API + iOS app (PRs #437–#438, #447; branch `rork/ios`)
- `/api/mobile/*`: login (Bearer tokens reuse the Session table), me,
  matches, match detail (pars/players/scores/holeGeo/hazards/**wind**),
  score POST (with clear), tee crowdfix POST
- Spec: `docs/rork-max-spec.md` — drove the whole build
- **iOS app v1 COMPLETE in Rork Max (SwiftUI)**: login/Keychain, match
  list, scorecard, on-course GPS (MapKit, hole rail, FROM TEE fallback,
  aim, wind tile), score entry (cycle + clear), FIX TEE flow
- Code synced to branch `rork/ios` via `.github/workflows/
  sync-ios-foundations.yml` (manual dispatch; Rork's export repo is
  `ancarcich-ops-claudecode-813`, public)
- Full pre-TestFlight review passed (null-encoding, location lifecycle,
  anchor logic, API client all verified)
- Apple Developer account: **approved**

### Share My Round (PRs #440–#446)
- Live link (`/r/[token]`) a seated player creates for their OWN round:
  thru-N, pace, projected finish, **ETA to a destination address**
  (Mapbox geocode + directions), optional scorecard; auto-refreshes;
  revoke = delete row; "Name's round status" iMessage preview
- **Private cushion** (+15/+30/+45/+60 min) baked silently into the
  projection (finish + drive = ETA stays consistent; recipient can't tell)
- Card lives at the bottom of the scorecard tab + ⋯ menu anchor entry
- Email delivery removed; milestone engine + score-write hooks kept
  dormant in `src/lib/roundShare.ts` for **SMS via Twilio later**
- Schema: `RoundShare` model (both prisma files, already pushed to Neon)

### Misc UX
- On-course MOVE PIN replaced with contextual CLEAR AIM (PR #446)
- Start round button under Preview the course (PR #423)
- Green front/back distances derived from green polygon (PR #422)
- Chart tooltip theme fix (PR #426)

## What's next

1. **TestFlight**: Rork publish flow → build → install → PLAY A ROUND.
   Device-only validation: satellite tiles (blank in cloud simulator —
   likely sim-only), real GPS accuracy, FIX TEE on a real tee, battery.
2. **App Store submission** after the test round: listing copy +
   privacy policy page (Claude to write both).
3. **SMS for Share My Round** (Twilio): plugs into the dormant
   milestone engine — no schema change needed.
4. iOS phase 2 backlog (in `docs/rork-max-spec.md`): Live Activities
   (lock-screen yardage — top pick), side-game standings/entry, odds,
   push notifications, Apple Watch.
5. Two-schema footgun: prod pushes are
   `npx prisma db push --schema prisma/schema.postgres.prisma` — plain
   `db push` hits the SQLite dev schema and fails.

## Working agreements / gotchas
- PR flow: branch → PR → squash-merge (Claude does this); schema
  changes need the Postgres `db push` BEFORE merge
- User runs DB/OSM scripts locally on Windows PowerShell (no `&&`,
  `Invoke-RestMethod` over curl); Claude preps exact commands
- Overpass + Neon both need retry/backoff in long scripts (already
  built into the OSM scripts)
