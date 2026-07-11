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

### POST /auth/signup
Body: `{ "username", "email", "password", "displayName"? }`
Rules: username 2–20 chars (letters, numbers, `. _ -`); valid email;
password ≥ 8 chars. 200: `{ "token", "user": { "id","username",
"displayName" } }` — same shape as login, so store the token and drop
straight in. 400: `{ "error" }` (validation, or "That username is
taken." / "An account with that email already exists.") — show verbatim.

### GET /me
200: `{ "user": { "id", "username", "displayName" } }`
Call on app launch to validate the stored token.

### GET /matches
200: `{ "matches": [ { "id", "courseName", "scheduledAt" (ISO),
  "completedAt" (ISO|null),
  "status" ("UPCOMING"|"IN_PROGRESS"|"COMPLETED"), "holes" (9|18),
  "startingHole", "scoringMode" ("GROSS"|"NET"|"CUSTOM"), "format",
  "pars": [4,4,3,…],             // exactly `holes` entries
  "myMatchPlayerId": "…"|null,
  "probabilities": { "<matchPlayerId>": 0.74 },   // blended win %, {} solo/scramble
  "tickerItems": ["SEUSS.MD 74%","LEADER -1 THRU 9","5 WAGERS"],
  "players": [ { "id", "userId", "displayName", "seat", "handicap",
    "avatarUrl"|null, "avatarSeed"|null, "avatarVariant"|null,
    "scoresByHole": { "1": 5 } } ] } ] }`
`tickerItems` is the scrolling home-card marquee (live odds + leader +
wagers); render it as a right-to-left scrolling strip **only on LIVE /
UPCOMING** cards (empty otherwise).
Most recent first, max 50. Carries pars + everyone's scores so home
match cards can render the colored hole dot-row, to-par, and standings
context without a per-match fetch. Avatar rule: render `avatarUrl`
when set; otherwise an initials bubble (the web's generated avatars
aren't reproducible natively).

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
        "avatarUrl": null, "avatarSeed": null, "avatarVariant": null,
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
  },
  "wind": { "speedMph": 8, "fromDeg": 220 },  // null when unavailable
  "odds": {                          // the live Market
    "probabilities": { "<matchPlayerId>": 0.67 },   // blended win %, 0..1
    "series": [                       // hole-bucketed history for the graph;
                                      //   null until the round has a score
      { "hole": 1, "<matchPlayerId>": 0.5, "<matchPlayerId2>": 0.5 },
      { "hole": 2, "<matchPlayerId>": 0.62, "<matchPlayerId2>": 0.38 }
    ],
    "weights": { "model": 0.29, "crowd": 0.0, "live": 0.71 }, // blend, sums ~1
    "wagerCounts": { "<matchPlayerId>": 3 },        // crowd "calls" per player
    "projNet": { "<matchPlayerId>": 53.2 },         // projected net (null early)
    "totalCalls": 5,
    "myCall": "<matchPlayerId>" ,      // the caller's current call, or null
    "open": true                       // false once the match is COMPLETED
  },
  "sideGames": [                     // [] when the match has none
    { "kind": "SKINS"|"STABLEFORD"|"NASSAU"|"WOLF"|"SNAKE"|"BBB"|
              "MATCH"|"SIXES"|"TEAM_VS_TEAM"|"TARGETS",
      "leaderboards": [
        { "key": "SKINS", "kind": "SKINS", "title": "Skins",
          "subtitle": "…",           // optional
          "rows": [ { "playerId", "player", "value" (display string),
                      "numeric", "isLeader" } ] }
      ] }
  ]
}
```
Any geo field can be null — the UI must degrade (see On-course screen).
Standings trend arrow is client-derived from the live probability:
≥0.40 up (▲ accent), ≥0.20 flat (— faint), else down (▼ danger).

### POST /matches/:id/score
Body: `{ "matchPlayerId": "…", "hole": 7, "strokes": 5 }`
`"strokes": null` clears the hole's score.
200: `{ "ok": true }`. Server auto-flips an UPCOMING match to
IN_PROGRESS on the first score.

### POST /matches/:id/complete
No body. Marks the match COMPLETED (same as the web's "Mark final").
200: `{ "ok": true }` -- idempotent; safe to call on an already-completed
match. Use for the FINISH ROUND button: show it on the GPS screen when
every player has a score on every hole, above ENTER SCORE (which
relabels to "Edit a score"); on success, exit to match detail.

### GET /groups
200: `{ "groups": [ { "id", "name", "slug"|null, "inviteCode" (6 chars),
  "memberCount", "matchCount",
  "memberNames": ["Tj","Seuss.md", …],   // first 4, for avatar stacks
  "createdAt" (ISO) } ] }`

### POST /groups
Body: `{ "name": "Saturday foursome" }` (≤40 chars)
200: `{ "group": { …same shape as GET } }` — creator is seated as owner.
400: `{ "error": "…" }` for empty/too-long names.

### POST /groups/join
Body: `{ "code": "ABC123" }` (case-insensitive; server uppercases)
200: `{ "group": { … } }` — idempotent, already-a-member is success.
404: `{ "error": "Code ABC123 doesn't match any group…" }` — show verbatim.

`GET /matches` accepts `?group=` to scope the feed exactly like the web
home feed (server-side, cross-group visibility):
- absent / `all` / empty → public rounds + every group you're in + any
  round involving a member of one of your groups.
- `public` → only ungrouped ("public") rounds.
- `<groupId>` → rounds posted to that group **OR involving any of its
  members** — so a group's feed shows every round a member played, not
  just rounds posted to the group. **Re-fetch with the new `group` value
  when the switcher changes** (this can't be done as a pure client-side
  filter — the client doesn't know other groups' memberships). Items
  still carry `groupId` (string|null).

### GET /groups/:id/leaderboard   (:id = group id or slug)
200: `{ "leaderboard": {
  "rows": [ { "userId", "username", "displayName"|null,
    "avatarUrl"|null, "avatarSeed"|null, "avatarVariant"|null,
    "matchesPlayed", "mainWins", "stablefordWins", "skinsWins",
    "nassauWins", "bbbWins", "snakeWins", "wolfWins", "totalWins" } ],
  "completedMatches": 12,
  "hasMain"|"hasStableford"|"hasSkins"|"hasNassau"|"hasBbb"|
    "hasSnake"|"hasWolf": bool,      // hide all-zero columns
  "courseRecords": [ { "courseName", "bestDisplayName", "gross",
    "net", "scheduledAt" } ],
  "champions": [ { "kind", "label", "winners": [{ "displayName" }],
    "courseName", "scheduledAt" } ],
  "streaks": [ { "displayName", "currentMainStreak",
    "bestMainStreak" } ]
} }`
403 when the caller isn't a member; 404 unknown group.

### GET /courses?q=…&lat=…&lng=…
Course picker for start-a-round. `q` searches the catalog by
name/city; `lat`+`lng` with no `q` = nearest courses. Max 20.
200: `{ "courses": [{ "id", "name", "city", "holes" (9|18),
  "access", "distanceMi"|null }] }`

### GET /players/suggest?q=…
No `q`: `{ "players": [recent partners, most recent first, with
  "lastHandicap"], "myLastHandicap": 11.6|null }`.
With `q`: `{ "players": [user search, "lastHandicap": null] }`.
Player shape: `{ "userId", "username", "displayName",
  "avatarUrl"|null, "lastHandicap"|null }`.

### GET /me/profile   (Settings tab)
200: `{ "profile": { "username", "displayName"|null, "ghin"|null,
  "avatarUrl"|null, "targetIndex"|null, "computedIndex"|null (the
  auto Sticks Index, read-only), "indexFromRounds", "totalRounds" } }`

### POST /me/profile
Body: any of `{ "displayName", "ghinNumber" }` (only sent keys change).
Rules (verbatim errors): name ≤ 40 chars, empty clears (falls back to
@username); GHIN 6–10 digits, empty clears. 200: `{ "profile": {…} }`.
Goal index has its own setter: `POST /me/target-index`.

### POST /me/avatar   (profile photo)
Raw image bytes as the body; `Content-Type: image/jpeg` (or png/heic).
Max 4 MB. 200: `{ "avatarUrl": "https://…" }`. 400 non-image/too
large; 503 if uploads aren't configured. ### DELETE /me/avatar clears
it → `{ "ok": true, "avatarUrl": null }` (falls back to initials).

### POST /matches/:id/pars   (edit pars)
Creator only, any status. Body `{ "pars": [4,5,3,…] }` (exactly `holes`,
each 3–6). 200 `{ "ok": true, "pars": [...] }`.

### POST /matches/:id/side-games   (enable/disable side games)
Creator only, not when COMPLETED. Body `{ "kinds": ["SKINS", …] }`
(recognized kinds; NASSAU needs 18). Reconciles rows. 200
`{ "ok": true, "kinds": [...] }`. Advanced config (Wolf/stakes) is web-only.

### GET/POST /matches/:id/shares   (Share My Round)
GET → `{ "shares": [{ id, token, url, includeScores, destAddress|null,
bufferMin }] }` (your own live links). POST (own round only) body
`{ "includeScores"?: true, "destAddress"?: "…", "bufferMin"?: 30 }` →
`{ "share": {…} }`; the public `url` is `.../r/{token}`.
### DELETE /shares/:id — stop a link you created → `{ "ok": true }`.

### POST /matches   (start a round)
Body: `{ "courseName" (must match the catalog), "scheduledAt" (ISO,
default now), "holes" (9|18), "startingHole" (1|10, 10 only for 9),
"scoringMode" ("NET"|"GROSS"|"CUSTOM"),
"format" ("INDIVIDUAL"|"SCRAMBLE"|"BOTH", default INDIVIDUAL),
"players": [{ "displayName", "handicap", "userId"?, "team"? }] (1–8),
"sideGames": [kinds]?, "groupId"? }`
200: `{ "match": { "id" } }` — open the new match's detail.
400/403 `{ "error" }` — show verbatim. Pars resolve server-side.
Format: **INDIVIDUAL** = all-vs-all. **SCRAMBLE** = one ball per team;
send each player a `team` (0|1), both teams non-empty. **BOTH** =
individual play *plus* a team-vs-team match (seeded to Best Ball); also
send `team` per player. `team` is ignored for INDIVIDUAL. Advanced
scramble-handicap and team-rule tuning stays on the web.

### PATCH /matches/:id   (edit a round before it starts)
Creator only, and only while UPCOMING with NO scores logged (400
otherwise). Body = same shape as POST /matches. Players reconciled by
seat (ids preserved). 200 `{ "match": { "id" } }`. Use for "Edit
details" on the match screen; once play begins, only DELETE is allowed.

### DELETE /matches/:id
Creator only. 200 `{ "ok": true }`; 403 for non-creators (show the
server's message). Removes the round and everything attached.
`GET /stats` rounds each carry `createdByMe` (bool) so the logged-
rounds list can show the delete affordance only on your own rounds.

### DELETE /matches/:id/my-scores
Any seated player (creator or not). Removes ONLY the caller's own
scores — the round drops out of *your* stats, the match and every
other player's scores are untouched. 200 `{ "ok": true, "removed": N }`;
403 if you're not a player in the round. Use this for "remove my score"
on rounds you didn't create; use DELETE /matches/:id (creator only)
to delete the whole round.

### POST /matches/:id/call   (place a crowd "call")
The Market's crowd bet: pick who you think wins. One call per user per
match. Body `{ "pickedPlayerId": "<matchPlayerId>" }` to call that
player, or `{ "pickedPlayerId": null }` to withdraw. 200:
`{ "ok": true, "myCall": "<matchPlayerId>"|null, "wagerCounts":
{ "<matchPlayerId>": n }, "totalCalls": n }` — apply these immediately
(no full refetch needed). 400 when the market is closed (match
COMPLETED) or the player isn't in the round. Mirrors the web
"Place your call" / placeWagerAction; re-prices the crowd component so
the odds graph moves.

### POST /matches/:id/pars   (edit per-hole pars)
Creator only; allowed at ANY status (fixing a wrong par mid-round is
legitimate). Body: `{ "pars": [4,5,3, …] }` — exactly `holes` entries,
each 3–6. Re-records an odds snapshot server-side. 200:
`{ "ok": true, "pars": [...] }`; 403 non-creator, 400 wrong length /
out-of-range (show the server message).

### POST /matches/:id/side-games   (add/remove side games)
Creator only; blocked once the round is COMPLETED. Body:
`{ "kinds": ["SKINS","STABLEFORD", …] }` — the full desired set.
Reconciles: removed kinds are dropped, added kinds created. NASSAU is
ignored on 9-hole rounds; a configured TEAM_VS_TEAM row is preserved
regardless (its team assignments can't be rebuilt from mobile).
Advanced per-game config (Wolf rotation, stakes) stays on the web.
200: `{ "ok": true, "kinds": [...] }`.

### GET /matches/:id/shares · POST /matches/:id/shares · DELETE /shares/:id
Live "share my round" links, own-seat only (the server derives your
seat — you can only share a round you're playing in).
- GET → `{ "shares": [ { id, token, url, includeScores,
  destAddress|null, bufferMin } ] }` (your own links for this round).
- POST body `{ "includeScores"?: true, "destAddress"?: "123 Main St",
  "bufferMin"?: 30 }` → `{ "share": { id, token, url, … } }`. Default
  `includeScores:true`; destination is geocoded at save; `bufferMin`
  clamped 0–180; milestones default FRONT9+FINISH. `url` is the public
  `https://sticks-golf.vercel.app/r/{token}` link to text to whoever's
  waiting on you.
- DELETE /shares/:id → `{ "ok": true }` (own share only) — stops the link.

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
- wind tile (top-right): speed in MPH + an arrow rotated to `fromDeg`
  (direction the wind blows FROM); hidden when `wind` is null
- tap anywhere on the map = AIM point: shows player→aim and aim→green;
  while an aim is set, a small CLEAR AIM chip appears (no idle button)
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
