# Sticks iOS — Rork Max build spec

A native SwiftUI companion for Sticks (golf scoring + on-course GPS).
Scope for v1: **sign in, pick a match, play a round** — the on-course
experience. Match creation, side-game config, admin, and stats stay on
the web app.

Backend: the existing Next.js deployment. All endpoints below are live
under `https://sticks-golf.vercel.app/api/mobile/`. Auth is a Bearer token.

---

## How to use this spec with Rork Max

Work in slices, one prompt per screen, in this order — each builds on
the last and can be verified in the simulator before moving on:

1. Project shell + auth (login screen, token storage, /me check)
2. Match list screen
3. Match detail / scorecard screen
4. On-course GPS screen (map + distances)
5. Score entry sheet
6. FIX TEE flow

Paste the **API contract** section into the first prompt so every
screen is generated against the real data shapes.

---

## API contract

Base URL: `https://sticks-golf.vercel.app/api/mobile`
All authenticated requests send `Authorization: Bearer <token>`.
All bodies are JSON. Errors are `{ "error": string }` with 400/401/403/404.

### POST /auth/login
Body: `{ "identifier": "<username or email>", "password": "..." }`
200: `{ "token": "<64-char hex>", "user": { "id", "username", "displayName" } }`
401: `{ "error": "Incorrect username/email or password." }`
Store the token in the Keychain. It's long-lived (1 year); no refresh
flow. A 401 from any endpoint means signed out → return to login.

### GET /me
200: `{ "user": { "id", "username", "displayName" } }`
Call on app launch to validate the stored token.

### GET /matches
200: `{ "matches": [ { "id", "courseName", "scheduledAt" (ISO),
  "status" ("UPCOMING"|"IN_PROGRESS"|"COMPLETED"), "holes" (9|18),
  "startingHole", "scoringMode" ("GROSS"|"NET"|"CUSTOM"), "format",
  "players": [ { "id", "displayName", "seat" } ] } ] }`
Most recent first, max 50.

### GET /matches/:id
200:
```json
{
  "match": {
    "id": "…", "courseName": "…", "scheduledAt": "…",
    "status": "IN_PROGRESS", "holes": 18, "startingHole": 1,
    "scoringMode": "NET", "format": "INDIVIDUAL",
    "isCreator": true,
    "myMatchPlayerId": "…" ,        // null if the caller isn't seated
    "pars": [4,4,3,5, …],            // exactly `holes` entries
    "players": [
      { "id": "…", "userId": "…", "displayName": "Tj",
        "handicap": 9, "seat": 1, "team": null,
        "scoresByHole": { "1": 5, "2": 4 } }   // keys are hole numbers
    ]
  },
  "holeGeo": {                       // keyed by absolute hole number
    "1": {
      "hole": 1,
      "teeLat": 33.72918, "teeLng": -118.34902,
      "greenLat": 33.73094, "greenLng": -118.34657,
      "greenFrontLat": null, "greenFrontLng": null,
      "greenBackLat": null, "greenBackLng": null,
      "greenPolygon": [ { "lat": …, "lng": … }, … ],   // may be null
      "fairwayPolygon": [ { "lat": …, "lng": … }, … ], // may be null
      "distanceYds": 309,
      "source": "golfbert"
    }
  },
  "hazards": {                       // keyed by hole; may be missing holes
    "7": [ { "kind": "WATER"|"SAND"|"OOB"|"OTHER",
             "label": "Bunker", "lat": …, "lng": … } ]
  }
}
```
Any geo field can be null — the UI must degrade (see On-course screen).

### POST /matches/:id/score
Body: `{ "matchPlayerId": "…", "hole": 7, "strokes": 5 }`
`"strokes": null` clears the hole's score.
200: `{ "ok": true }`. Server auto-flips an UPCOMING match to
IN_PROGRESS on the first score.

### POST /matches/:id/tee   (FIX TEE crowdfix)
Body: `{ "hole": 7, "lat": …, "lng": …, "accuracyYd": 8 }`
200: `{ "ok": true }` or `{ "ok": false, "reason": "…" }` — when
`ok:false`, show `reason` verbatim and let the user retry. The server
rejects GPS accuracy worse than ±35y and positions inconsistent with
the scorecard distance (max(30y, 15%) from the green).

---

## Distance math (client-side)

All distances in **yards**. Haversine:
`yards = 2 * 6371000 * asin(sqrt(sin²(Δlat/2) + cos(lat1)cos(lat2)sin²(Δlng/2))) * 1.0936133`

- TO PIN · CENTER = player → (greenLat, greenLng)
- FRONT = min distance from player to any `greenPolygon` vertex;
  fall back to greenFront point if set; else CENTER − 8
- BACK = max distance to any `greenPolygon` vertex; else greenBack
  point; else CENTER + 8

## Screens

### 1. Login
Fields: username-or-email, password. Error text inline. On success
store token in Keychain → match list. Dark-on-cream aesthetic matching
the web app: cream background (#F7F3EA), deep green accent (#285E45),
serif display numerals.

### 2. Match list
Sections: Live (IN_PROGRESS), Upcoming, Recent (COMPLETED). Row:
course name, date, player avatars/count, status chip. Tap → match
detail. Pull-to-refresh.

### 3. Match detail / scorecard
Header: course, date, status. Scorecard grid: rows = players, columns
= holes with par row; the caller's row first. Tap any cell → score
entry sheet (only if `myMatchPlayerId` != null or `isCreator`).
Primary CTA: **"On-course GPS →"** (only for IN_PROGRESS/UPCOMING).
Poll GET /matches/:id every 30s while foregrounded.

### 4. On-course GPS (the core screen)
Full-screen MapKit satellite (or Mapbox if easier) centered per hole:
- camera fits tee + green with padding; rotate so tee→green points up
- markers: tee, green center, green polygon outline, hazards with
  distance chips from the player
- live blue-dot from CoreLocation (best accuracy, ~1s updates)
- top: hole rail (1–18 chips w/ par + the player's score) to switch holes
- dominant readout: **TO PIN · CENTER** big serif; FRONT/BACK smaller
- tap anywhere on the map = AIM point: shows player→aim and aim→green
- ENTER SCORE button → score sheet
- Advance to next hole automatically when a score is saved
- Degradation: if a hole has no green (`greenLat` null) show "GREEN
  NEEDED — open the web admin to map this hole" and disable score-less
  features but still allow score entry.
- **Live Activity** (phase 1.5): current hole, par, TO PIN distance on
  the lock screen / Dynamic Island while a round is live.

### 5. Score entry sheet
Par-relative chips (birdie/par/bogey…) plus a number row 1–12.
Saving posts /score for the selected player, then cycles to the next
player without a score on that hole (same behavior as the web app),
then advances the hole. Support clearing a score.

### 6. FIX TEE flow
Small "FIX TEE" control on the on-course screen (only when
`myMatchPlayerId` != null and GPS accuracy ≤ 35y). Opens a confirm
card: "Stand on the tee box you play from" + live GPS accuracy + the
here→green distance next to the scorecard yardage. Confirm → POST
/matches/:id/tee. On `ok:false` show `reason` with a Try Again button.

## Non-goals for v1
Match creation, side-game configuration and event entry (Wolf/Snake/
BBB), odds/market, tournaments, admin, Apple Watch. All reachable via
the web app; revisit after v1 ships.

## Phase 2 backlog (server work exists or is trivial to add)
- Side-game standings in match detail (server: computeAllSideGames)
- Wolf/Snake event entry endpoints
- Win-probability (odds) in match detail
- Push notifications for score updates in group matches
