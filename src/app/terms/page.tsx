import type { Metadata } from "next";
import SiteFooter from "@/components/marketing/SiteFooter";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Terms of Service · Sticks",
  description: "The terms that govern your use of Sticks.",
};

export default function TermsPage() {
  return (
    <article className="max-w-2xl mx-auto py-2">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Terms of Service
      </h1>
      <p className="text-sm text-faint mt-1">Last updated: July 2026</p>

      <div className="mt-6 space-y-5 text-[14px] leading-relaxed text-mute">
        <p>
          These terms govern your use of Sticks, a golf scoring and on-course
          GPS application. By using Sticks, you agree to these terms.
        </p>

        <Section title="Using Sticks">
          <p>
            You&rsquo;re responsible for the activity on your account and for
            keeping your login secure. Use Sticks lawfully and don&rsquo;t
            misuse or disrupt the service or other players&rsquo; use of it.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            Scores, rounds, and other content you enter remain yours. You grant
            us the permission needed to store and display that content to
            provide the service (for example, showing a round to the players in
            it or to people you share it with).
          </p>
        </Section>

        <Section title="Text messages">
          <p>
            Text updates are optional and opt-in. Message frequency varies and
            is recurring during an active round. Msg &amp; data rates may apply.
            Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> for
            help. See our{" "}
            <a href="/privacy" className="underline hover:text-ink">
              Privacy Policy
            </a>{" "}
            for how we handle your number.
          </p>
        </Section>

        <Section title="Availability & changes">
          <p>
            Sticks is provided on an &ldquo;as is&rdquo; basis, and features may
            change over time. We may update these terms; continued use after an
            update means you accept the revised terms.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of {BUSINESS.governingLaw},
            without regard to its conflict-of-laws rules.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Sticks is operated by {BUSINESS.proprietor} ({BUSINESS.entityType}),
            based in {BUSINESS.location}. Questions? Email{" "}
            <a
              href={`mailto:${BUSINESS.email}`}
              className="underline hover:text-ink"
            >
              {BUSINESS.email}
            </a>
            .
          </p>
        </Section>

        <p className="pt-2">
          <a href="/privacy" className="underline hover:text-ink">
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a href="/sms" className="underline hover:text-ink">
            Text updates
          </a>
        </p>
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
