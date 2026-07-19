# Walk-Up! — T-Ball Soundboard

A single-file soundboard for playing each player's walk-up song in batting
order. Songs are stored in the browser (IndexedDB) on whatever device you
use — upload them once on your phone and they stay there. The lineup
(names, order, who's here today) is editable before every game.

No build step, no server, no database — it's just `index.html`.

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
