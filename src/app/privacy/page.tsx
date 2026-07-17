import type { Metadata } from "next";
import SiteFooter from "@/components/marketing/SiteFooter";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Privacy Policy · Sticks",
  description: "How Sticks collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl mx-auto py-2 prose-sticks">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Privacy Policy
      </h1>
      <p className="text-sm text-faint mt-1">Last updated: July 2026</p>

      <div className="mt-6 space-y-5 text-[14px] leading-relaxed text-mute">
        <p>
          Sticks (&ldquo;Sticks,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is a
          golf scoring and on-course GPS application. This policy explains what
          we collect, how we use it, and the choices you have.
        </p>

        <Section title="Information we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Account information</strong> you provide — username, email
              address, display name, and optional profile details (GHIN number,
              avatar, goal handicap).
            </li>
            <li>
              <strong>Golf activity</strong> you create in the app — rounds,
              hole scores, courses, groups, and side-game results.
            </li>
            <li>
              <strong>Location</strong> — while you use the on-course GPS, your
              device location is used to show distances and pace. It is used for
              the live round experience and is not sold.
            </li>
            <li>
              <strong>Phone numbers</strong> — if you opt in to text updates
              (via our opt-in page or a shared round link), we store the number
              and a record of your consent so we can send the updates you asked
              for.
            </li>
          </ul>
        </Section>

        <Section title="How we use information">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To provide scoring, GPS, stats, and round-sharing features.</li>
            <li>
              To send <strong>SMS updates you have opted in to</strong> — round
              pace, projected finish, ETA home, and optional live scores.
            </li>
            <li>To operate, secure, and improve the service.</li>
          </ul>
        </Section>

        <Section title="SMS / text messaging">
          <p>
            We send text messages only to numbers that have opted in. Message
            frequency varies and is recurring during an active round. Msg &amp;
            data rates may apply. You can opt out at any time by replying{" "}
            <strong>STOP</strong>; reply <strong>HELP</strong> for help.
          </p>
          <p className="mt-2">
            <strong>
              We do not sell your phone number, and we do not share it — or your
              SMS consent — with third parties or affiliates for their own
              marketing purposes.
            </strong>{" "}
            Numbers are shared only with our messaging provider (Twilio) solely
            to deliver the messages you requested.
          </p>
        </Section>

        <Section title="Sharing">
          <p>
            We do not sell your personal information. We share data only with
            service providers that help us run Sticks (for example, hosting,
            database, and SMS delivery), and only as needed to provide the
            service, or where required by law.
          </p>
        </Section>

        <Section title="Data retention & security">
          <p>
            We keep information for as long as your account is active or as
            needed to provide the service, and we take reasonable measures to
            protect it. You can request deletion of your account or your opt-in
            record by contacting us.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Opt out of texts any time by replying STOP.</li>
            <li>
              Request access to, correction of, or deletion of your information
              by emailing us.
            </li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            Sticks is operated by {BUSINESS.proprietor} ({BUSINESS.entityType}),
            based in {BUSINESS.location}. Questions about this policy or your
            data? Email{" "}
            <a
              href={`mailto:${BUSINESS.email}`}
              className="underline hover:text-ink"
            >
              {BUSINESS.email}
            </a>{" "}
            or call{" "}
            <a
              href={`tel:${BUSINESS.phoneHref}`}
              className="underline hover:text-ink"
            >
              {BUSINESS.phone}
            </a>
            .
          </p>
        </Section>

        <p className="pt-2">
          <a href="/terms" className="underline hover:text-ink">
            Terms of Service
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
