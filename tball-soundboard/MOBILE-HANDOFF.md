# Walk-Up! — Mobile app handoff (for Rork)

Build a native iOS/Android app (React Native / Expo) of **Walk-Up!**, the
T-ball walk-up soundboard that already runs as a web app at
`tball-soundboard.vercel.app`. The web app is the reference implementation:
`tball-soundboard/index.html` in this repo, with current-state screenshots in
`tball-soundboard/design/` (390×844, light + dark). The native app must be
**interoperable** with it: same sync backend, same team codes, same backup
file format — a coach on the web app and a coach on the phone app can share
one team.

## Short prompt (paste this into Rork, attach this doc + 2–3 screenshots)

> Build "Walk-Up!", a T-ball walk-up-song soundboard app for coaches. Each
> player has an optional recorded name announcement and a walk-up song;
> on Game Day the coach either steps through a drag-to-reorder batting order
> or uses a free-for-all grid where tapping any kid plays their sounds
> (announcement first, then song, back-to-back). Audio files are imported
> from the phone, stored locally, and can be trimmed with fade in/out
> (non-destructive, applied at playback). Teams sync between coaches' phones
> via 8-character team codes against an existing REST backend (spec
> attached — do not build a new backend). Includes team colors + logo
> customization, one-file backup/restore, and a first-run welcome screen.
> Visual style: "trading card" ballpark design, clay orange + grass green,
> athletic condensed type (spec + screenshots attached). Full details in the
> attached MOBILE-HANDOFF doc — follow its data model, API contract, and
> backup format exactly.

---

## 1. Product in one paragraph

T-ball coaches want every kid to get a big-league walk-up moment. The coach
preps once (import each kid's song + a Voice-Memo-style announcement, set
names/jersey numbers), then runs games one-handed in sunlight: either a
batting order with one giant play button, or a tap-any-kid grid, because
T-ball order is often a free-for-all. Multiple coaches stay in sync via a
team code. Users are parents, not tech people — copy is plain and warm.

## 2. Screens (mirror the web app; screenshots show exact layout)

1. **Game Day (default tab, the money screen)**
   - Header: wordmark + team name + logo (if set); compact **inning chip**
     (label INNING, − / number / +). Inning also auto-advances when the
     batting order wraps.
   - **Order mode:** trading-card batter panel — clay ribbon "NOW BATTING ·
     1ST" (ordinal of order position, NOT jersey number), green gradient
     panel holding jersey `#7` (amber) + name (big, white, uppercase),
     ANNOUNCE / SONG tinted stat cells. Below: `‹ Previous batter` (small)
     · **116px round play button** · `Next batter ›` (small, green).
     Play = announcement then song, gapless-ish; tap again stops. On-deck +
     in-the-hole mini-cards. Skips players marked absent; wrapping past the
     last batter bumps the inning.
   - **Free-for-all mode:** 2-column grid of big green player cards
     (jersey, name, song). Tap = play their announcement + song; tap again
     stops. After a kid plays, the card dims with an amber ✓ badge;
     "Clear ✓s" resets. Cards with no audio are dimmed and route to Lineup.
2. **Lineup** — player cards: grass gradient order-number tile (muted "OUT"
   tile when absent), jersey number field (optional, ≤3 chars), name field,
   drag-handle reorder, present/absent dot toggle, delete; two dropdowns per
   player: Announce + Song (any imported track can serve either role).
   Add-player input. "Restart game" (batter 1, inning 1, clears ✓s).
   **Free-for-all mode toggle card** (with ON badge) lives here.
3. **Songs** — import audio (document picker, multi-select; m4a/mp3/wav/aac
   at minimum). Track rows: play/preview tile, inline rename, "EDITED"
   badge, usage line ("Announcement for Leo · Walk-up for Maya"), edit +
   delete. **Trim & fades editor** (bottom sheet): Start / End / Fade in /
   Fade out sliders + live preview with a **moving playhead** on a progress
   bar (see §5 re: waveform). Tip card about sourcing audio (buy tracks /
   record announcements in Voice Memos; streaming apps don't provide files).
4. **Settings** — Team colors (live jersey-pennant preview + hex readouts,
   circular preset swatches incl. silver/white/black + custom picker, reset);
   team logo upload; **Music defaults** (global fade in/out for tracks
   without their own edit — a per-track edit always wins); **Share with
   coaches** (team sync sheet: create code / join / big code display /
   Copy code / Share invite / Sync now / Stop syncing); **Backup** (export /
   import one file); quick-start guide reopener.
5. **Welcome (first run only)** — pitch line, 3-step quick start, "Set up my
   team" → Songs tab, or join-with-code input right there. Never shown again
   once the user has data; reopenable from Settings.

## 3. Data model (keep field names — they're wire format)

```ts
Player: { id: string, name: string, jersey: string, introId: string|null,
          soundId: string|null, present: boolean }
Edit:   { start: number, end: number, fadeIn: number, fadeOut: number } // seconds
Track:  { id: string, name: string, edit: Edit|null }  // + local audio file
State:  { team: string, players: Player[], batterIdx: number, inning: number,
          colors: { primary?: hex, secondary?: hex },
          audio: { fadeIn?: number, fadeOut?: number },   // defaults
          logo: { rev: string, size: number, type: string }|null,
          freeMode: boolean, freePlayed: string[] }      // device-local
```
ids are short slugs like `id-x8k2mp4q` (`[a-z0-9-]{3,24}`). `batterIdx`
indexes the **present** players only. Persist state locally (AsyncStorage);
audio files in the app's document directory.

## 4. Sync backend — REUSE OURS, do not build one

Base URL `https://tball-soundboard.vercel.app/api` (make it a config
constant). Capability model: the team code IS the auth. Codes look like
`ABCD-1234` (alphabet A-Z minus I/O plus 2-9). Whole-state last-write-wins;
audio blobs are immutable per id and chunk-transferred (**3 MB chunks** —
serverless body limit).

- `GET /health` → `{ ok, store: "ready"|"missing" }` (`?deep=1` adds probe)
- `POST /team` body = sync doc → `{ code }` (503 `{error, detail}` if storage down)
- `GET /state?code=X` → latest sync doc | 404 if unknown code
- `PUT /state?code=X` body = sync doc → `{ ok }` (404 if team never created)
- `PUT /track?code=X&id=Y&part=N` body = raw chunk bytes → `{ ok }`
- `POST /track?code=X&id=Y&finalize=1&parts=N&type=<mime>` → `{ ok }`
- `GET /track?code=X&id=Y&start=B&len=L` → raw bytes of that byte range

**Sync doc** (what `/state` and `/team` carry):
```json
{ "v": 1, "updatedAt": 1710000000000, "team": "...", "colors": {...},
  "audio": {...}, "logo": { "rev", "size", "type" } | null,
  "players": [Player...],
  "sounds": [{ "id", "name", "edit": Edit|null, "size": bytes, "type": mime }] }
```
Client algorithm (mirror the web app): push = upload any local tracks not
yet uploaded (chunks → finalize), then PUT doc with `updatedAt: now`.
Pull = GET doc; if `updatedAt` > last applied: replace team/colors/audio/
players, upsert track names/edits, download missing tracks by ranged GETs,
delete local tracks that were synced but left the doc, fetch logo by its
`rev` if changed. Debounce pushes (~1.5 s after a change); pull on app
foreground and via a manual Sync now. `freeMode`/`freePlayed`/`inning`/
`batterIdx` are NOT in the doc — they stay per-device.

## 5. Audio engine (the critical native work)

- Playback via expo-av (or expo-audio): play announcement, then song,
  back-to-back; preload the second while the first plays.
- **Trim:** start playback at `edit.start` s, hard-stop at `edit.end` s.
- **Fades:** no Web Audio in RN — ramp volume manually (`setVolumeAsync`
  every ~50 ms): 0→1 across `fadeIn` after the trim start, 1→0 across the
  last `fadeOut` before the trim end. If a track has no `edit`, apply the
  Settings-page default fades. Non-destructive always: never re-encode files.
- Configure audio session to play in **silent-mode** on iOS
  (`playsInSilentModeIOS: true`) — a muted phone at the field must still play.
- Editor: real waveform rendering is optional. v1 can show a clean
  **progress bar with a moving playhead** + the four sliders (this parity
  matters more than the waveform art). If a waveform library is available
  (audio PCM peaks), match the web look: kept region green, trimmed dims,
  clay envelope line.

## 6. Backup file format (must interop with the web app)

One binary file, extension `.wu`, MIME `application/octet-stream`:
```
"WALKUP1|" + <12-digit zero-padded byte length of header JSON> + "|"
+ header JSON (UTF-8)
+ concatenated raw audio file bytes, in header sounds[] order
+ raw logo bytes last (if header.logo present)
```
Header JSON: `{ v:1, team, colors, audio, logo: {size,type}|null, players,
sounds: [{ id, name, edit, size, type }] }`. Export via share sheet
(expo-sharing); import via document picker → parse, confirm ("replaces
everything on this device"), replace local data. Test round-trip against a
web-exported file.

## 7. Design system (match the trading-card look — see screenshots)

- **Light** ground `#F6F3EA`, panel `#FFFFFF`, ink `#22301F` / soft `#5D6A57`,
  line `#DCD5C2`. **Dark** ground `#131F17`, panel `#1C2B20`, ink `#EDEACF` /
  soft `#9BA893`. Follow the OS theme.
- Brand: **clay** `#C9663A` (dark `#D9784C`) = primary accent (ribbon, play
  button, active tab, order ordinal); **grass** `#2E7D46` = secondary (name
  panel, number tiles, Next/Add buttons, free-for-all cards); **bulb amber**
  `#F2B63C` = jersey numbers on green + ✓ badges. Deep variants for hard
  "pressable" offset shadows: clay `#A94F2A`, grass `#1F5C32`.
- **User-customizable colors:** primary/secondary are user-settable (presets
  incl. silver/white/black + free pick) and MUST stay readable: compute text
  color on a fill (dark ink if the fill is light), and darken a light brand
  color when used as text on a panel. This logic exists in the web app
  (`applyColors()` + `--accent-ink/-text`, `--grass-ink/-text`) — port it.
- Type: athletic **condensed heavy** display face for names/numbers/labels
  (uppercase, tracked); system-default body face. Tabular numerals for
  numbers. Radii: hero card 24, cards/rows 14–16, chips pill. Big touch
  targets (≥44pt); the play button is the largest thing on Game Day.
- Copy voice: plain, warm, zero jargon. Reuse the web app's strings.

## 8. Scope guidance

**In v1:** everything above.
**Explicitly out of v1:** accounts/login, payments (App Store later),
push notifications, recording audio in-app (nice v2: record announcements
directly), waveform art if it slows things down, any new backend.
**Do not** bundle any music with the app (users supply their own files —
that's the licensing model).

## 9. Acceptance checklist

- [ ] Import an m4a from Files; assign as announcement + song; Game Day
      plays them back-to-back; works with iPhone mute switch on.
- [ ] Trim a song to 15 s with 1 s fade-out; playback honors it; editor
      playhead moves during preview.
- [ ] Drag-reorder lineup; mark a kid absent; order + ordinal skip them;
      wrapping the order bumps the inning.
- [ ] Free-for-all: tap kid → plays; ✓ appears; Clear resets; absent kids
      hidden.
- [ ] Create a team code in the app → **join it from the web app** and see
      the full team, and vice-versa (this is the interop bar).
- [ ] Export backup in the app → import it on the web app, and vice-versa.
- [ ] Set white as primary color: every label stays readable, both themes.
- [ ] Fresh install shows the welcome screen once; joining by code from it
      pulls the whole team down.
