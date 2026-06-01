# Handoff: UI/UX Redesign — Braves Minors Tracker

**You are picking up an existing, deployed Next.js app and applying a complete UI/UX
redesign.** Everything you need is in this document. Implement it exactly, verify, then
commit & push so Vercel redeploys.

---

## 1. Project context

- **What it is:** a daily-updating dashboard for the Atlanta Braves minor-league system
  (scores, and — later — prospects, risers/slumpers, transactions).
- **Repo:** `ancarcich-ops/braves-minors-tracker`. The Next.js app is at the **repo root**
  (this is the standalone copy; do not look for a subfolder).
- **Stack:** Next.js 14 (App Router, TypeScript), Tailwind CSS, server components. Data from
  the public **MLB Stats API** (`statsapi.mlb.com`) via `src/lib/mlb.ts`, with a mock-data
  fallback (`USE_MOCK_DATA=1`) in `src/lib/mock.ts`.
- **Deployed:** live on Vercel; auto-redeploys on every push to the default branch.
- **Current state:** v1 dashboard works (today's scores across affiliates). This redesign is
  a visual overhaul only — it does **not** change data fetching.

### What this redesign delivers
A glassmorphic dark theme on the Braves palette, Framer Motion animations (staggered card
reveals, animated active-nav indicator, live-score pulse), Lucide icons, the Geist font, a
dashboard hero with summary chips, games grouped into level sections, polished placeholder
pages, and loading skeletons.

---

## 2. Pre-flight

1. Confirm you're in the repo with the app at root: `ls` should show `package.json`, `src/`,
   `next.config.js`, `tailwind.config.ts`.
2. **Do NOT touch** these files — they're correct as-is: `src/lib/*`, `next.config.js`,
   `tsconfig.json`, `postcss.config.js`, `.gitignore`, `.env.example`.
3. Add three dependencies, then install. Update `package.json` (full contents in §3) and run:
   ```bash
   npm install
   ```
   New deps: `framer-motion@^11.11.17`, `lucide-react@^0.460.0`, `geist@^1.3.1`.

---

## 3. Files to create / replace

Create or fully overwrite each file below with the exact contents shown. New files are
marked `(new)`; the rest replace existing v1 files.

### `package.json`
```json
{
  "name": "braves-minors-tracker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "framer-motion": "^11.11.17",
    "geist": "^1.3.1",
    "lucide-react": "^0.460.0",
    "next": "^14.2.35",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3"
  }
}
```

### `tailwind.config.ts`
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Official Atlanta Braves palette + supporting neutrals.
        braves: {
          navy: '#13274F',
          red: '#CE1141',
          gold: '#EAAA00',
        },
        ink: {
          950: '#070b16',
          900: '#0a0f1e',
          850: '#0e1426',
          800: '#131a30',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(206,17,65,0.5), 0 0 24px -4px rgba(206,17,65,0.45)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
```

### `src/app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

@layer base {
  body {
    @apply bg-ink-900 text-slate-100 antialiased;
    /* Layered radial glows + a subtle navy field for depth. */
    background-image:
      radial-gradient(60rem 40rem at 85% -10%, rgba(206, 17, 65, 0.12), transparent 60%),
      radial-gradient(50rem 40rem at -10% 0%, rgba(19, 39, 79, 0.65), transparent 55%),
      linear-gradient(180deg, #0a0f1e 0%, #070b16 100%);
    background-attachment: fixed;
  }
}

@layer components {
  /* Frosted-glass surface used by cards and the nav. */
  .glass {
    @apply border border-white/10 bg-white/[0.045] backdrop-blur-xl;
  }
  .glass-hover {
    @apply transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.07];
  }
}

/* Slim, on-brand scrollbar. */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
  background-clip: content-box;
}
```

### `src/app/layout.tsx`
```tsx
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Braves Farm Tracker',
  description:
    'Daily scores, prospects, risers & slumpers, and transactions across the Atlanta Braves minor-league system.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="min-h-screen font-sans">
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-12 pt-6">
          <div className="border-t border-white/10 pt-6 text-xs text-slate-500">
            Unofficial fan project. Live data from the MLB Stats API. Not affiliated with
            MLB or the Atlanta Braves.
          </div>
        </footer>
      </body>
    </html>
  );
}
```

### `src/components/motion.tsx` (new)
```tsx
'use client';

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const easeOut = [0.22, 1, 0.36, 1] as const;

/** Fade + rise on mount. Use `delay` to sequence standalone elements. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easeOut, delay }}
    >
      {children}
    </motion.div>
  );
}

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOut } },
};

/** Container that staggers its <Stagger.Item> children into view. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

Stagger.Item = StaggerItem;
```

### `src/components/TeamMonogram.tsx` (new)
```tsx
// A clean monogram avatar — reliable and on-brand (no risk of broken
// remote logo images for lower-level affiliates).

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export default function TeamMonogram({
  name,
  abbreviation,
  isBraves,
  size = 36,
}: {
  name: string;
  abbreviation: string;
  isBraves: boolean;
  size?: number;
}) {
  const label = (abbreviation || name.slice(0, 3)).slice(0, 3).toUpperCase();
  const hue = hashHue(name);

  const style = isBraves
    ? { background: 'linear-gradient(135deg, #CE1141, #8d0b2c)' }
    : { background: `linear-gradient(135deg, hsl(${hue} 35% 32%), hsl(${hue} 40% 20%))` };

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight text-white ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.3, ...style }}
      aria-hidden
    >
      {label}
    </span>
  );
}
```

### `src/components/ScoreCard.tsx`
```tsx
import type { Game, GameSide } from '@/lib/types';
import TeamMonogram from './TeamMonogram';

const LEVEL_STYLE: Record<string, string> = {
  AAA: 'bg-braves-red/15 text-red-300 ring-braves-red/30',
  AA: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  'High-A': 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  'Low-A': 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  Rookie: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  DSL: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
};

function Row({ side, winner, dim }: { side: GameSide; winner: boolean; dim: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${dim ? 'opacity-55' : ''}`}>
      <TeamMonogram name={side.name} abbreviation={side.abbreviation} isBraves={side.isBraves} size={34} />
      <span className={`flex-1 truncate text-sm ${side.isBraves ? 'font-semibold text-white' : 'text-slate-300'}`}>
        {side.name}
      </span>
      {winner && <span className="text-[10px] text-braves-gold">▸</span>}
      <span className={`ml-1 w-6 text-right text-lg tabular-nums ${winner ? 'font-bold text-white' : 'font-medium text-slate-400'}`}>
        {side.runs ?? '–'}
      </span>
    </div>
  );
}

function StatusBadge({ game }: { game: Game }) {
  if (game.state === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-braves-red/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-braves-red/30">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-braves-red opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-braves-red" />
        </span>
        {game.inning || 'LIVE'}
      </span>
    );
  }
  if (game.state === 'final') {
    return <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{game.inning || 'Final'}</span>;
  }
  const t = game.startTimeUTC
    ? new Date(game.startTimeUTC).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : 'Scheduled';
  return <span className="text-[11px] font-medium text-slate-400">{t}</span>;
}

export default function ScoreCard({ game }: { game: Game }) {
  const homeWins = game.state === 'final' && (game.home.runs ?? -1) > (game.away.runs ?? -1);
  const awayWins = game.state === 'final' && (game.away.runs ?? -1) > (game.home.runs ?? -1);
  const decided = game.state === 'final';
  const live = game.state === 'live';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl p-3.5 shadow-card transition-all duration-300 glass glass-hover hover:-translate-y-0.5 ${
        live ? 'ring-1 ring-braves-red/40' : ''
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
            LEVEL_STYLE[game.level] ?? 'bg-slate-500/15 text-slate-300 ring-slate-500/30'
          }`}
        >
          {game.level}
        </span>
        <StatusBadge game={game} />
      </div>
      <div className="space-y-1.5">
        <Row side={game.away} winner={awayWins} dim={decided && !awayWins} />
        <Row side={game.home} winner={homeWins} dim={decided && !homeWins} />
      </div>
    </div>
  );
}
```

### `src/components/Nav.tsx`
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { CalendarDays, Star, TrendingUp, ArrowLeftRight } from 'lucide-react';

const links = [
  { href: '/', label: 'Scores', icon: CalendarDays },
  { href: '/prospects', label: 'Prospects', icon: Star },
  { href: '/movers', label: 'Risers & Slumpers', icon: TrendingUp },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-braves-red to-[#8d0b2c] text-sm font-black text-white shadow-glow">
            A
          </span>
          <span className="text-[15px] font-bold tracking-tight">
            Braves <span className="text-slate-400">Farm</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                  active ? 'text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-10 rounded-lg bg-white/10 ring-1 ring-white/10"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
```

### `src/app/page.tsx`
```tsx
import { getScoreboard } from '@/lib/mlb';
import type { Game, Level } from '@/lib/types';
import ScoreCard from '@/components/ScoreCard';
import { Reveal, Stagger } from '@/components/motion';
import { Radio, Trophy, Clock, Layers } from 'lucide-react';

export const revalidate = 60;

const LEVEL_ORDER: Level[] = ['AAA', 'AA', 'High-A', 'Low-A', 'Rookie', 'DSL'];

function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function StatChip({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Radio;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className={`glass flex items-center gap-2.5 rounded-xl px-3 py-2 ${accent ? 'ring-1 ring-braves-red/40' : ''}`}>
      <Icon className={`h-4 w-4 ${accent ? 'text-braves-red' : 'text-slate-400'}`} />
      <div className="leading-tight">
        <div className="text-base font-bold tabular-nums">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const date = searchParams.date || easternToday();
  const { games, isMock } = await getScoreboard(date);

  const live = games.filter((g) => g.state === 'live').length;
  const finals = games.filter((g) => g.state === 'final').length;
  const upcoming = games.filter((g) => g.state === 'scheduled').length;

  const byLevel = LEVEL_ORDER.map((level) => ({
    level,
    games: games.filter((g) => g.level === level),
  })).filter((g) => g.games.length > 0);

  return (
    <div>
      <Reveal>
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-braves-red">
              Around the Farm
            </span>
            {isMock && (
              <span className="rounded-full bg-braves-gold/15 px-2 py-0.5 text-[10px] font-semibold text-braves-gold ring-1 ring-braves-gold/30">
                sample data
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Today&apos;s Slate
          </h1>
          <p className="mt-1 text-sm text-slate-400">{prettyDate(date)}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip icon={Radio} value={live} label="Live" accent={live > 0} />
            <StatChip icon={Trophy} value={finals} label="Final" />
            <StatChip icon={Clock} value={upcoming} label="Upcoming" />
            <StatChip icon={Layers} value={byLevel.length} label="Levels playing" />
          </div>
        </div>
      </Reveal>

      {games.length === 0 ? (
        <Reveal delay={0.1}>
          <div className="glass rounded-2xl px-6 py-16 text-center">
            <p className="text-lg font-semibold text-slate-200">Quiet day on the farm</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
              No games scheduled across the system today. Lower levels like FCL and DSL
              start their seasons in June — check back soon.
            </p>
          </div>
        </Reveal>
      ) : (
        <div className="space-y-8">
          {byLevel.map(({ level, games: levelGames }, i) => (
            <section key={level}>
              <Reveal delay={0.05 * i}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">{level}</h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  <span className="text-xs text-slate-500">{levelGames.length} game{levelGames.length > 1 ? 's' : ''}</span>
                </div>
              </Reveal>
              <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {levelGames.map((g: Game) => (
                  <Stagger.Item key={g.gamePk}>
                    <ScoreCard game={g} />
                  </Stagger.Item>
                ))}
              </Stagger>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

### `src/app/loading.tsx` (new)
```tsx
function SkeletonCard() {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-3.5">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-10 rounded bg-white/10" />
        <div className="h-4 w-12 rounded bg-white/10" />
      </div>
      <div className="space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="h-[34px] w-[34px] rounded-xl bg-white/10" />
            <div className="h-3.5 flex-1 rounded bg-white/10" />
            <div className="h-4 w-5 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="mt-2 h-9 w-56 rounded-lg bg-white/10" />
        <div className="mt-2 h-3 w-40 rounded bg-white/10" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
```

### `src/components/ComingSoon.tsx`
```tsx
import type { LucideIcon } from 'lucide-react';
import { Reveal } from './motion';

export default function ComingSoon({
  title,
  kicker,
  blurb,
  icon: Icon,
  features,
}: {
  title: string;
  kicker: string;
  blurb: string;
  icon: LucideIcon;
  features: string[];
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-braves-red">{kicker}</span>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        </div>

        <div className="glass relative overflow-hidden rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-braves-red to-[#8d0b2c] shadow-glow">
              <Icon className="h-6 w-6 text-white" />
            </span>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-braves-gold" />
                In the build queue
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{blurb}</p>
            </div>
          </div>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-slate-300 ring-1 ring-white/5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-braves-red" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}
```

### `src/app/prospects/page.tsx`
```tsx
import { Star } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

export default function ProspectsPage() {
  return (
    <ComingSoon
      icon={Star}
      kicker="Top of the System"
      title="Prospects"
      blurb="A seeded Braves Top-30 you can re-rank anytime, each linked to live stats and a player profile. Numbers come straight from the MLB Stats API — never hand-typed."
      features={[
        'Editable Top-30 rankings',
        'Per-player profiles with live stats',
        'Position & level filters',
        'Age-relative-to-level signal',
      ]}
    />
  );
}
```

### `src/app/movers/page.tsx`
```tsx
import { TrendingUp } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

export default function MoversPage() {
  return (
    <ComingSoon
      icon={TrendingUp}
      kicker="Trends"
      title="Risers & Slumpers"
      blurb="A nightly job snapshots every player's stats so a trend engine can flag who's heating up or cooling off — rolling last-7 / last-15 vs. season, with level context."
      features={[
        'Hot & cold flags',
        'Rolling 7 / 15-game windows',
        'Promotion-watch alerts',
        'Powered by nightly snapshots',
      ]}
    />
  );
}
```

### `src/app/transactions/page.tsx`
```tsx
import { ArrowLeftRight } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

export default function TransactionsPage() {
  return (
    <ComingSoon
      icon={ArrowLeftRight}
      kicker="Roster Moves"
      title="Transactions"
      blurb="A live feed of promotions, demotions, IL moves, signings, and releases across the system — pulled from the MLB Stats API transactions endpoint for the Braves organization."
      features={[
        'Promotions & demotions',
        'Injured-list moves',
        'Signings & releases',
        'Filter by affiliate',
      ]}
    />
  );
}
```

---

## 4. Verify

```bash
USE_MOCK_DATA=1 npm run build      # must compile + type-check with no errors
USE_MOCK_DATA=1 npm run start &    # then open http://localhost:3000
```

Confirm:
- Dashboard shows the "Around the Farm" / "Today's Slate" hero with 4 summary chips.
- Game cards have monogram badges, level pills, and a pulsing LIVE badge on in-progress games.
- Games are grouped under level headers (AAA, AA, High-A, ...).
- Nav is sticky/glassy; the active tab has a sliding highlight as you navigate.
- `/prospects`, `/movers`, `/transactions` render the polished "In the build queue" cards.

> Note: `USE_MOCK_DATA=1` is only for offline/local rendering. Do **not** set it in production —
> production must hit the live MLB API. The mock fallback also auto-engages if the API is
> unreachable.

## 5. Commit & push

```bash
git add .
git commit -m "Redesign UI: Framer Motion, design system, polish

- Add framer-motion, lucide-react, geist font
- Glassmorphic design system (gradients, tokens, scrollbar)
- Sticky nav with active-state animation and icons
- Redesigned score cards: monograms, live pulse, win/loss styling
- Dashboard hero with summary chips, games grouped by level, staggered reveals
- Polished placeholder pages and loading skeletons"
git push
```

Vercel auto-redeploys. Done.

---

## 6. Roadmap (what comes after this redesign — for context, not part of this task)

1. **Prospects** — seed an editable Braves 2026 Top-30 in a committed data file; each player's
   profile pulls live stats from the MLB API (stats/ages come from the API, never hand-typed).
2. **Transactions** — wire the MLB Stats API transactions endpoint for org id 144.
3. **Risers & Slumpers** — add a database (Prisma + Postgres) + a nightly Vercel Cron job that
   snapshots player stats, then a trend engine that flags hot/cold over rolling windows.
