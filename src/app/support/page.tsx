import type { Metadata } from "next";
import SiteFooter from "@/components/marketing/SiteFooter";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Support · Sticks",
  description:
    "Get help with Sticks — contact us, and answers to common questions about scoring, GPS, side games, accounts, and privacy.",
};

export default function SupportPage() {
  return (
    <article className="max-w-2xl mx-auto py-2 prose-sticks">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Support
      </h1>
      <p className="text-sm text-faint mt-1">
        We&rsquo;re a small team and we read everything.
      </p>

      {/* Contact card — the primary reason this page exists (App Store
          support URL). Keep the email prominent and clickable. */}
      <div className="mt-6 rounded-xl border border-border bg-panel2/40 p-5">
        <h2 className="font-display text-base font-semibold text-ink">
          Contact us
        </h2>
        <p className="mt-1 text-[14px] text-mute">
          Questions, bugs, or feedback — email us and we&rsquo;ll get back to
          you, usually within a day or two.
        </p>
        <dl className="mt-4 space-y-2 text-[14px]">
          <div className="flex items-baseline gap-2">
            <dt className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
              Email
            </dt>
            <dd>
              <a
                href={`mailto:${BUSINESS.email}`}
                className="text-accent underline hover:text-ink"
              >
                {BUSINESS.email}
              </a>
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
              Phone
            </dt>
            <dd>
              <a
                href={`tel:${BUSINESS.phoneHref}`}
                className="text-ink hover:text-accent"
              >
                {BUSINESS.phone}
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 space-y-5 text-[14px] leading-relaxed text-mute">
        <Section title="Getting started">
          <p>
            Create a free account, then start a round from the home screen. Add
            the people you&rsquo;re playing with, pick your course, and tap in
            scores as you go — net and gross update live, with handicap strokes
            applied automatically.
          </p>
        </Section>

        <Section title="On-course GPS">
          <p>
            Sticks shows live distances to the front, center, and back of each
            green plus carries to hazards. Allow location access when prompted
            so distances work. Your location is used to show distances and to
            find nearby courses — it isn&rsquo;t sold or used to track you.
          </p>
        </Section>

        <Section title="Side games & money">
          <p>
            Sticks tracks the side games your group plays — Nassau, Skins, Wolf,
            Snake, Stableford, and more — and tallies the standings for you. Any
            dollar amounts you enter are only to help work out who owes whom.
          </p>
          <p className="mt-2">
            <strong className="text-ink">
              Sticks never collects, holds, or pays out money.
            </strong>{" "}
            There is no wallet or payment in the app — players settle up on their
            own. The win-odds &ldquo;market&rdquo; and picks are for fun only, with
            no real money involved.
          </p>
        </Section>

        <Section title="Groups, tournaments & following">
          <p>
            Create a group to keep your regular crew&rsquo;s rounds together, or
            run a tournament with a live leaderboard. You can follow other
            players to see their rounds in your feed — follows are one-way and
            need the other person&rsquo;s approval (unless they&rsquo;ve turned on
            auto-accept in Settings).
          </p>
        </Section>

        <Section title="Managing your account">
          <p>
            Update your display name, handicap, avatar, and optional phone number
            in <strong className="text-ink">Settings</strong>. To permanently
            delete your account and personal data, go to{" "}
            <strong className="text-ink">Settings → Delete account</strong>. This
            can&rsquo;t be undone.
          </p>
        </Section>

        <Section title="Privacy & your data">
          <p>
            See our{" "}
            <a href="/privacy" className="underline hover:text-ink">
              Privacy Policy
            </a>{" "}
            for what we collect and how it&rsquo;s used, and our{" "}
            <a href="/terms" className="underline hover:text-ink">
              Terms of Service
            </a>
            . For any privacy request, email{" "}
            <a
              href={`mailto:${BUSINESS.email}`}
              className="underline hover:text-ink"
            >
              {BUSINESS.email}
            </a>
            .
          </p>
        </Section>
      </div>

      <SiteFooter />
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-base font-semibold text-ink mb-1.5">
        {title}
      </h2>
      {children}
    </section>
  );
}
