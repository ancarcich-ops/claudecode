# Sticks — Design Theme Exploration Brief

You are being asked to propose **alternative visual design themes** for an existing iOS-first golf prediction-market app called **Sticks**. The current owner is happy with the app's information architecture, component patterns, and overall feel — they want to see 3–5 **alternative theme directions** to compare against the current look. They will likely keep the current theme but want to be sure they're not missing a better one.

**What's in scope:** color palette, typography pairings, mood/vibe, surface texture (matte vs glassy vs paper), accent treatment, dark/light handling.

**What's out of scope:** layouts, navigation patterns, component shapes, copy voice, feature set. Don't redesign the app — re-skin it.

---

## What Sticks is

A native-feel mobile web app where small groups of golfers:
- Set up a match (course + tee time + players + handicaps + format + side games)
- Bet on outcomes via a crowd-driven prediction market (think Polymarket for your foursome)
- Log live scores hole-by-hole with one-tap entry
- Settle up afterwards with auto-computed side-game leaderboards (Stableford, Skins, Wolf, Best Ball Teams, etc.)

**Users:** golfers aged ~25–55, casual-competitive, the kind of group that texts each other "$10 closest to the pin" on the first tee. Skews male. Uses the app on iPhone, usually outside in sunlight, often one-handed while their friends putt.

**Tone the product wants to project:** confident, sharp, a little bit "smart money" — like the app is the one keeping track so the friends can just play. Not cute, not corporate, not bro-y, not Masters-broadcast formal. Closer to **Robinhood meets Strava meets a moleskine scorecard** than to GolfNow or 18Birdies.

---

## Current theme (the one to propose alternatives to)

### Palette — dark mode (the default)

| Token | RGB | Hex | Role |
|---|---|---|---|
| `bg` | 11 15 12 | `#0B0F0C` | Page background (near-black green-tinted) |
| `panel` | 17 24 21 | `#111815` | Card surface |
| `panel2` | 22 31 27 | `#161F1B` | Nested surface, inputs |
| `border` | 31 42 37 | `#1F2A25` | Card / input borders |
| `ink` | 232 240 234 | `#E8F0EA` | Primary text |
| `mute` | 138 160 148 | `#8AA094` | Secondary text |
| `faint` | 93 107 100 | `#5D6B64` | Tertiary text, axis labels |
| `accent` | 52 211 153 | `#34D399` | Primary action, win, leader (emerald) |
| `accentDim` | 16 185 129 | `#10B981` | Hover/pressed state |
| `danger` | 248 113 113 | `#F87171` | Loss, over-par, error (warm red) |
| `gold` | 251 191 36 | `#FBBF24` | Winner badges, momentum |

### Palette — light mode

Mostly inverted with `#F7FAF8` page bg, white cards, emerald accent darkened to `#059669`, danger to `#DC2626`, gold to a burnt amber `#B45309`. Both themes share the same green-tinted neutral spine.

### Typography
- **Display + wordmark:** Bricolage Grotesque (variable, often heavy/condensed)
- **Body / UI:** Geist Sans (Vercel's house sans)
- **Tabular numerics:** Geist Mono (used aggressively — scorecards, chip pills, leaderboards, "thru 14 of 18", win %, all per-hole scores)

### Visual signatures
- **Live indicator:** soft emerald pulsing glow around match cards that are in-progress (`box-shadow` ring + slow opacity breathe)
- **Hole dots:** small filled circles per hole, colored by score (accent for under-par, danger for over, mute for par); the in-progress dot has a pulsing ring
- **Sticky scorecard column:** dark panel bg, ink names, color dot prefix per player
- **Numbers everywhere:** big tabular monospaced figures dominate; the app reads like a Bloomberg terminal more than a sports app
- **Cards have flat borders, no shadows.** Minimal rounding (rounded-md / rounded-lg). No glassmorphism, no gradients, no skeuomorphism. Geometric, calm.

### What's working about the current theme
- Sunlight readability is genuinely good on iPhone (high contrast emerald on near-black)
- Distinguishes itself from competitors which are mostly bright/marketing-y
- The green tint on the neutrals feels golf-y without being literal grass/sky
- Tabular numerics on everything makes scores instantly scannable

### What might be worth exploring
- Dark mode is the default — light mode is functional but secondary; it could be more thoughtful
- Accent is emerald — feels golf-default. A non-obvious accent could feel sharper
- Geist + Bricolage is currently popular (very 2024–2025 Vercel-template) — could a more distinctive type pairing help the brand stand out?
- Surface treatment is uniformly flat — a touch of warmth/grain/paper could nod to the "scorecard in your pocket" feel without losing the digital edge

---

## What to deliver

For each theme direction, give me:

1. **Name** — 1–3 words capturing the mood (e.g. "Country club paper", "Off-strip", "Caddie's notebook")
2. **One-paragraph rationale** — what this direction signals about Sticks, who'd love it, why this audience
3. **Palette** — full token table matching the structure above (dark mode + light mode), in hex
4. **Typography pairing** — display font + body font + numeric font, with one-sentence justification for the pairing
5. **Surface treatment notes** — flat vs textured vs glass; corner radius; border vs shadow; any subtle motif (paper grain, halftone, ticker scroll, etc.)
6. **One thing it deliberately abandons** from the current theme, and why
7. **One reference** — an existing app, brand, or visual artifact this borrows energy from (link or short description). Helpful for the owner to mentally anchor.

Optional but appreciated: a small ASCII mock of a single match-card header (course name + live pill + side-game ticker) showing the proposed accent and typographic hierarchy.

---

## Constraints / non-negotiables

- **Mobile-first.** All proposals must render legibly in iPhone-in-sunlight conditions. Pale-on-pale palettes are a no.
- **Dark mode must remain viable** — it's how 80% of usage happens. Light mode can be the secondary citizen.
- **Tabular numerics are sacred.** Whatever numeric font you propose must have proper monospaced figures (not just `font-variant-numeric: tabular-nums` faking it).
- **No skeuomorphism** (no leather, no felt-green-fairway textures, no scorecard paper as the literal surface). You can nod to "scorecard" through restraint and grid, not through texture imitation.
- **Accessibility:** all text/background pairings ≥ 4.5:1 contrast for body text, ≥ 3:1 for large text and UI affordances.

---

## Tonal range to explore (pick 3–5, your call)

Sample directions to spark ideas — not a menu, feel free to invent your own:

- **"Off-strip"** — Las Vegas sportsbook minimalism. Neon accent over deep navy or charcoal. The smart money lane.
- **"Caddie's notebook"** — Moleskine-warm cream + ink-black + a single saturated accent. Calm, analog-ish, but still digital-sharp.
- **"Bermudagrass"** — owning the golf palette but in a non-default direction (sand, sky, fescue) rather than tournament emerald.
- **"Terminal"** — full Bloomberg/Reuters aesthetic. Monospace everything, hairline borders, amber-on-black option as a secondary skin.
- **"Members only"** — country-club restraint. Heritage navy + ivory + a single brass accent. Closer to Aimé Leon Dore than to Augusta.
- **Whatever else feels right.** If you see a direction the brief misses, propose it.

---

## Format

Markdown is fine. Length whatever serves the deliverable — concise is good, but each direction should be unmistakably distinct from the others. If two of your directions feel like sibling palettes, collapse them.
