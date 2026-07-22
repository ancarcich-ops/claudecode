# Walk-Up! — Mobile handoff, update slice 1

Addendum to `MOBILE-HANDOFF.md`. Everything there still applies; this slice
covers what changed in the web app *after* that doc was written. The items in
§2–§4 are **protocol requirements** — a mobile client that skips them can
corrupt shared teams for everyone.

## 1. Repo & infrastructure moved (references only)

- Source of truth is now the standalone repo **`ancarcich-ops/walk-up`**
  (app at the repo root; the old `claudecode/tball-soundboard/` folder is
  retired).
- API base URL is unchanged: `https://tball-soundboard.vercel.app/api`
  (domain now served by the `walk-up` Vercel project).

## 2. REQUIRED: pending-track guard (data-loss prevention)

Real incident: a joining phone failed some audio downloads, then pushed a
sync doc listing only the tracks it *had* — every other phone dutifully
deleted the "removed" songs. The fix is now part of the protocol:

- Client state gains `pending: [{id, name, edit, size, type}]` — tracks the
  team has that **this device hasn't downloaded yet**.
- A failed track download must **never** abort applying a doc and never
  drop the track: put its metadata in `pending`, keep going, retry on every
  subsequent sync (and surface a "not downloaded here yet" row in Songs).
- **When composing a push doc, `sounds[]` = locally-held tracks ∪ pending
  tracks.** A device may only omit a track when the user explicitly deleted
  it. This is the invariant that makes partial downloads harmless.

## 3. REQUIRED: logical clock on pushes

`updatedAt` in a pushed doc = `max(Date.now(), lastAppliedUpdatedAt + 1)`.
Guarantees a device's push supersedes the doc it last applied even when
phone clocks are skewed (wall-clock alone let a future-stamped doc shadow
newer pushes).

## 4. Server API additions (already live; consume, don't rebuild)

- `GET /state?code=X&list=1` → `{ snapshots: [{ at, sounds, players }] }` —
  summaries of retained history snapshots (server now keeps the last **10**).
- `GET /state?code=X&at=<updatedAt>` → that specific snapshot doc.
- `GET /track?code=X&listall=1` → `{ tracks: [{ id, size }] }` — every audio
  blob the team has ever uploaded. **Audio blobs are never deleted
  server-side**, which enables salvage recovery.
- `GET /health?deep=1` → adds `probe: "ok"|"failed"` and a `detail` string
  with the real underlying storage error. Probe keys are unique per call.

## 5. Recovery UX ("Restore missing songs…", in the team-sync sheet)

Two-tier flow the mobile app should mirror:
1. **History first:** `?list=1`, pick the snapshot with the most sounds,
   fetch it via `?at=`, diff against local+pending, confirm with the user,
   merge the missing metas into `pending`, **push** (so every phone's list
   regains them), then download.
2. **Salvage fallback** (history empty): `?listall=1`, filter out ids
   already known and the logo blob (`state.logo.rev`), then rebuild names
   from player references — a player's `introId` match → `"<name>
   announcement"`, `soundId` match → `"<name> walk-up"`, otherwise
   `"Recovered track N"` (`type: "audio/mpeg"`, `edit: null`). Same
   merge-push-download tail. Note: trim/fade edits are not recoverable by
   salvage.

## 6. Silent-switch playback — proven critical, field-tested

Confirmed on hardware: coaches keep phones on silent, and audio classified
as "sound effects" is muted. The native app **must** set the audio session
to playback (`playsInSilentModeIOS: true` in expo-av) before any playback.
(The web app achieves this with a hidden looping silent `<audio>` element;
native doesn't need that hack.) Also set Media Session / now-playing
metadata (title = team name) — the web app does.

## 7. UX changes to mirror

- **Sync sheet:** big code display now has **Copy code** (clipboard, with
  "Code copied ✓" feedback) and **Share invite…** (native share sheet).
  Invite text template — keep the code alone on the last line so it's easy
  to long-press/copy:
  ```
  Join our Walk-Up! team soundboard ⚾

  Open <app URL> on your phone and enter the team code (right on the
  welcome screen, or under Settings → Team sync).

  Team code:
  ABCD-1234
  ```
- **Settings split:** "Sharing" became two cards — **Share with coaches**
  (team sync; "get every coach's phone on the same soundboard") and
  **Backup** ("a spare copy, not for sharing"). Keep that framing.
- **Export:** filename is date-stamped (`walkup-backup-YYYY-MM-DD.wu`);
  share-sheet first, automatic save-to-files fallback if sharing fails
  (never fail silently), with a visible status line either way.
- **Trim editor:** live **playhead** — a position line sweeps the
  waveform/progress bar during preview, honoring the trim window.
- **Songs sourcing tip** now leads with the lowest-friction method; copy to
  reuse: *"The easy way: open Voice Memos, hit record, and play the song
  out loud from any speaker for 20–30 seconds. Stop, tap Share → Save to
  Files, then add it here."* Announcements use the same app; purchased
  tracks / GarageBand are the fallback; close with the trim-editor tip.

## 8. Additions to the acceptance checklist

- [ ] Join a team while several track downloads are forced to fail: the app
      shows pending rows, and a subsequent push from this device does NOT
      remove those tracks for other clients.
- [ ] Restore missing songs works against a team whose current doc has an
      empty `sounds[]` (history path), and against one with empty history
      (salvage path, names derived from player refs).
- [ ] Push from a device with a clock set minutes in the past still
      supersedes the doc it just pulled.
- [ ] Hardware test: ringer switch on silent → tapping play produces sound.
- [ ] Copy code puts exactly the code on the clipboard; Share invite
      matches the template with the code on its own line.
