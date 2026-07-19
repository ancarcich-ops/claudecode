# Walk-Up! — Design handoff

A brief for a design pass over the T-ball walk-up soundboard. The product is
feature-complete for the season; this pass is about **formatting, polish, and
visual consistency** — not new features and not a redesign of the concept.

---

## 1. What this is

**Walk-Up!** plays each kid's stadium walk-up — a recorded name/number
announcement followed by their song — at youth T-ball games. A coach preps
players + audio once, drags the batting order before each game, then runs the
whole game from one big play button. Multiple coaches share one team via a
team-code sync; new coaches self-onboard from a welcome screen.

**The user & context that must drive every decision:**

- One coach, one phone (~390 px wide), **one-handed, outdoors in bright sun**,
  while also wrangling five-year-olds. Big targets, high contrast, glanceable.
- The audience is parents/coaches, not tech people. Copy is plain-spoken.
- Emotional register: little-league joy — pennants, scoreboards, jersey
  numbers — but it's a *tool first*. Game Day is the money screen.

**Where the product is:** live in production on Vercel (static site + tiny
serverless API), being tested with a real team, with an App Store version
planned later (Capacitor wrap). Design debt fixed now carries forward.

---

## 2. Where everything lives

| Thing | Location |
| --- | --- |
| The whole app (markup + CSS + JS) | `tball-soundboard/index.html` — **one file, no build step** |
| Sync API (don't touch for this pass) | `tball-soundboard/api/*.js` |
| Local preview | `node tball-soundboard/dev-server.js` → http://localhost:3799 (sync works, filesystem storage) |
| Screenshots (current state) | `tball-soundboard/design/*.png` (2× DPR, 390×844) |
| Dev branch | `claude/tball-soundboard-app-f2y0td` |
| Production | branch `tball-soundboard-deploy` (root = built copy of `index.html`) — **don't push here**; the owner's workflow regenerates it |

Opening `index.html` directly via `file://` also works (sync UI hides itself).

---

## 3. Current design system (in `:root` custom properties)

**Palette** — "daytime ballpark" light theme, "night game" dark theme:

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--chalk` / `--bg` | `#F6F3EA` | `#131F17` | page ground |
| `--panel` | `#FFFFFF` | `#1C2B20` | cards, sheets, nav |
| `--ink` / `--ink-soft` | `#22301F` / `#5D6A57` | `#EDEACF` / `#9BA893` | text |
| `--grass` (secondary brand) | `#2E7D46` | — | Next-batter, wordmark, waveforms |
| `--clay` → `--accent` (primary brand) | `#C9663A` | `#D9784C` | play button, active tab, order number |
| `--night` / `--board` | `#131F17` | `#0C1510` | scoreboard card |
| `--bulb` | `#F2B63C` | same | scoreboard digits, focus rings |

**User-customizable colors:** Settings lets coaches override primary/secondary
(9 jersey presets + silver/white/black + custom). JS sets inline overrides on
`:root` for `--accent`, `--grass`, and derived tokens. Two derived pairs keep
light choices readable — **preserve this system**:

- `--accent-ink` / `--grass-ink`: text color *on* the fill (auto dark for light fills)
- `--accent-text` / `--grass-text`: darkened variant when the brand color is used *as text* on panel

Anything styled with a brand color must go through these vars, never literals.

**Type:** display = `"Avenir Next Condensed", "Arial Narrow", …` (800 weight,
uppercase, tracked labels — the athletic voice); body = `system-ui`. Numerals
use `tabular-nums`. No webfonts (see constraints).

**Recurring components:** `.card` (14px radius, 1px `--line` border, soft
shadow), `.eyebrow` label, `.btn` / `.btn.quiet`, `.icon-btn` (42px),
bottom-sheet overlays (`.overlay` + `.editor`), chunky "pressable" buttons with
hard offset shadows (play button, Next batter).

---

## 4. Screen inventory (screenshots in `design/`)

| # | File | Surface |
| --- | --- | --- |
| 01 | `01-welcome.png` | First-run welcome/onboarding sheet (also via Settings → quick-start) |
| 02 | `02-lineup.png` | Lineup: jersey #, name, two sound dropdowns, drag handle, sit-out dot, delete |
| 03 | `03-gameday.png` | Game Day: scoreboard inning, NOW BATTING card, play button, prev/next, on-deck |
| 04 | `04-songs.png` | Songs: upload drop zone, track rows (rename inline, edit, delete), sourcing tip |
| 05 | `05-trim-editor.png` | Trim & fades bottom sheet: waveform canvas, 4 sliders, preview/reset/save |
| 06 | `06-settings.png` | Settings (full page): colors + logo, music defaults, sharing, quick-start |
| 07 | `07-team-sync.png` | Team sync bottom sheet with live team code |
| 08 | `08-gameday-dark.png` | Game Day, dark theme |
| 09 | `09-lineup-dark.png` | Lineup, dark theme |

---

## 5. Known formatting problems (the punch list)

Ranked roughly by how much they bother us. Screenshots show all of these.

1. **Bottom nav is cramped with 4 tabs** — "GAME DAY" wraps to two lines
   (03/04); the active pill hugs its text. Needs a tighter labeling/type
   solution at 390px.
2. **Team name input truncates** (`.teamline input` is fixed 150px) — "RIVER
   CITY OTTERS" clips mid-word on every screen (all shots). Should fit ~24
   chars or scale.
3. **Songs rows: rename input clips track names** ("Colton announcemer…",
   "Party in the USA (cli") with a dashed underline running the full fixed
   width (04). Needs better width handling/affordance for the inline rename.
4. **Lineup row internal alignment** (02): the "ANNOUNCE" label kisses its
   select with no gap; the big order number floats in leftover whitespace;
   jersey box/name/handle spacing feels unresolved. This is the screen coaches
   fiddle with most.
5. **Game Day song line wraps awkwardly** (03): "Colton announcement →
   Thunderstruck (clip)" breaks with a centered orphan and a top-aligned note
   icon. Consider truncation/two-line treatment.
6. **On-deck rows are ragged** (03): tag / #12 Maya / song title don't share a
   clean baseline grid, and long titles wrap under the name.
7. **Settings is a wall of same-weight cards** (06): colors, logo, defaults,
   sharing, quick-start all stack with identical visual priority; swatch rows
   wrap unevenly (9+2+custom). Wants grouping/hierarchy.
8. **Welcome sheet density** (01): solid but long on small phones; the join
   row + tip compete with the primary CTA.
9. **Trim editor labels** (05): slider rows are functional but plain; value
   column widths jiggle as numbers change; canvas corners/borders could sit
   better in the sheet.
10. **Dark theme is less considered than light** (08/09): literal greens for
    the wordmark/preview icons (`#7FBF93`) rather than tokens; custom team
    colors aren't adjusted for dark ground; shadows nearly invisible.
11. **Sound-row icon rhythm** (04): play / waveform-edit / trash icons have
    inconsistent visual weight; "EDITED" chip + usage line get crowded when both
    present.

---

## 6. Hard constraints — do not break

1. **Single self-contained file.** All CSS/JS stays inline in `index.html`.
   **No external requests of any kind** — no font CDNs, no icon libraries, no
   remote images (a mirrored deployment runs under a CSP that blocks them).
   Inline SVG + system fonts only; assets as data URIs if truly needed.
2. **Both themes, token-first.** `prefers-color-scheme` + `data-theme`
   overrides both directions. Restyle via the custom properties; if you touch
   brand-colored elements, route them through the `-ink`/`-text` derived vars.
3. **JS contract.** Behavior is wired to element **ids** and these classes —
   keep them present (restyle freely): tab ids (`tab-*`, `view-*`), `.player-row`
   (+`.num`, `.pname`, `.jnum`, `select.intro`, `select.song`, `.drag-handle`,
   `.here`, `.remove`, `data-pid`), `.sound-row` (+`input.t`, `.preview`,
   `.editbtn`), `#bigPlay`/`.play-btn(.playing)`, editor/sync/onboard overlay
   ids, `.sw`/`.sw-custom` swatches, backup/export ids. Grep the `<script>`
   before renaming anything.
4. **Touch targets ≥ ~42px**; the drag handle keeps `touch-action: none`.
5. **Copy voice:** plain, warm, zero jargon (it survived real-coach testing —
   edit for fit, not tone).
6. **`reduced-motion` respected**; keyboard focus visible (`--bulb` ring).
7. iOS realities: safe-area insets on nav/sheets, no hover-dependent
   affordances, `100dvh` not `100vh`.

## 7. QA after changes

`node tball-soundboard/dev-server.js`, then walk: welcome → add 2 players →
upload 2 short audio files → assign + rename → trim editor save → Game Day
play (chains announcement→song) → drag reorder → sit-out → Settings colors
(try **white** primary — text must stay readable) → export/import backup →
create team code, join it from a second browser profile, confirm everything
arrives. Check dark mode on every screen you touched.
