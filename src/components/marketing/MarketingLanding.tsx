import Link from "next/link";
import SiteFooter from "./SiteFooter";

// Public landing shown to signed-out visitors (and to reviewers who
// hit the root domain). Real product + company content: what Sticks is,
// what it does, how it works, and links to the legal/company pages via
// the shared footer. Replaces the old one-card placeholder that read as
// "not an established site."
export default function MarketingLanding() {
  return (
    <div>
      {/* Hero */}
      <section className="pt-6 pb-10 sm:pt-10 sm:pb-14">
        <span className="chip text-[11px]">Golf scoring · GPS · side games</span>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
          All your games.{" "}
          <span className="text-accent">One round.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] sm:text-base text-mute leading-relaxed">
          Sticks is a golf scoring and on-course GPS app. Keep the group&rsquo;s
          scorecard, get distances and satellite hole maps, and let Wolf, Skins,
          Nassau, and Bingo&nbsp;Bango&nbsp;Bongo score themselves — all on the
          same card, in real time.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/signup" className="btn btn-primary">
            Create your account →
          </Link>
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
        </div>
        <p className="mt-3 text-[12px] text-faint">
          Free to start. Play a round with your regular group in minutes.
        </p>
      </section>

      {/* Features */}
      <section className="border-t border-border pt-10">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Everything the group needs, on one card
        </h2>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Feature
            title="Live group scorecard"
            body="One shared scorecard for the whole foursome. Enter scores hole-by-hole and everyone sees the round update live."
          />
          <Feature
            title="On-course GPS"
            body="Satellite hole maps with distances to the front, center, and back of every green, hazards, and a 3D flyover of the hole you're playing."
          />
          <Feature
            title="Side games, auto-scored"
            body="Skins, Wolf, Nassau, Stableford, Match play, Snake, Sixes, Bingo Bango Bongo, and team games — all scored automatically as you go."
          />
          <Feature
            title="Live win odds"
            body="A play-money market that reprices each player's chance to win as the round unfolds. Pick who takes it — just for fun, no real money."
          />
          <Feature
            title="Handicaps & stats"
            body="A running handicap index from your posted rounds, with a clear breakdown of how it's calculated, plus per-player stats and history."
          />
          <Feature
            title="Text updates"
            body="Following a friend's round? Opt in to SMS updates on their pace, projected finish, ETA home, and — if they share them — live scores."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border mt-12 pt-10">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Step
            n={1}
            title="Post a round"
            body="Pick a course, add your players, and choose the side games you're playing today."
          />
          <Step
            n={2}
            title="Play & score"
            body="Enter scores on the shared card and use the GPS on every hole. Games and odds update themselves."
          />
          <Step
            n={3}
            title="See who won"
            body="Final standings, every side game settled, and your handicap and stats updated automatically."
          />
        </ol>
      </section>

      {/* SMS callout */}
      <section className="border-t border-border mt-12 pt-10">
        <div className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Keep up with a round by text
            </h2>
            <p className="mt-2 text-sm text-mute leading-relaxed">
              When someone shares their round, you can opt in to get SMS updates
              on their pace and finish — no account needed. Message &amp; data
              rates may apply; reply STOP to opt out anytime.
            </p>
          </div>
          <Link href="/sms" className="btn btn-ghost shrink-0 self-start">
            Learn about text updates →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-4">
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-[13.5px] text-mute leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="card p-4">
      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-accent">
        Step {n}
      </div>
      <h3 className="mt-1 font-display text-base font-semibold text-ink">
        {title}
      </h3>
      <p className="mt-1.5 text-[13.5px] text-mute leading-relaxed">{body}</p>
    </li>
  );
}
