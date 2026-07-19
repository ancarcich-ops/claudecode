# Walk-Up! — T-Ball Soundboard

A soundboard for playing each player's announcement + walk-up song in
batting order. Songs are stored in the browser (IndexedDB) on each
device; the lineup (names, order, who's here today) is editable before
every game. Tracks can be trimmed and given fade in/out (non-destructive,
applied at playback via Web Audio).

Two ways to move data between devices:

- **Backup** (Songs tab): export everything to a single `.wu` file and
  import it on another device. Works with no server at all.
- **Team sync** (cloud button in the header): create a team code on one
  phone, join with it on others; lineup and songs sync through the
  `/api` functions (last save wins). Requires a Vercel Blob store
  connected to the project (see below).

## Layout

- `index.html` — the whole app (static, no build step)
- `api/` — Vercel serverless functions for team sync
  (`health`, `team`, `state`, `track`), backed by Vercel Blob
- `dev-server.js` — local server mirroring the Vercel layout with
  filesystem storage (`node dev-server.js`, no cloud needed)

## Enabling team sync in production

In the Vercel project: **Storage** tab → **Create Database → Blob** →
choose **Public** access (the sync API cannot write to Private-mode
stores — `/api/health?deep=1` will report exactly that if you pick
wrong) → connect it to this project (this adds `BLOB_READ_WRITE_TOKEN`),
then redeploy. Until then the app works fine and the sync sheet explains
what's missing.

## Deploying to Vercel (separate project — does not touch Sticks)

This folder deploys as its own Vercel project, completely independent of
the Sticks app that lives at the repo root:

1. Go to <https://vercel.com/new> and import the `claudecode` repo again
   (yes, the same repo — Vercel allows multiple projects per repo).
2. On the import screen:

   | Setting            | Value                                  |
   | ------------------ | -------------------------------------- |
   | Project Name       | `tball-soundboard` (or anything)       |
   | Framework Preset   | **Other**                              |
   | **Root Directory** | `tball-soundboard`  ← the key setting  |
   | Build Command      | (leave empty / default)                |
   | Output Directory   | (leave empty / default)                |

3. Click **Deploy**. Because the root directory is `tball-soundboard`,
   this project only sees this folder — it will never build or redeploy
   Sticks, and pushes that don't touch this folder won't trigger it
   (Vercel skips builds when the root directory is unchanged).

You'll get a URL like `tball-soundboard.vercel.app`. Open it on your
phone, add the songs once in the **Songs** tab, and add it to your home
screen for game day.

## Notes

- Songs live in the browser of the device that uploaded them, not on the
  server — so use the phone you bring to games.
- Phones require a tap before playing audio; the big play button is that
  tap, so nothing extra is needed.
