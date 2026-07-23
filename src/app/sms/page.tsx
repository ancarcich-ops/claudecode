import type { Metadata } from "next";
import SmsOptInForm from "./SmsOptInForm";
import SiteFooter from "@/components/marketing/SiteFooter";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Text updates · Sticks",
  description:
    "Opt in to receive SMS updates from Sticks about the golf rounds you follow.",
};

export default function SmsOptInPage() {
  return (
    <div className="max-w-lg mx-auto py-2">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Get text updates from Sticks<span className="text-accent">.</span>
        </h1>
        <p className="text-sm text-mute mt-2 leading-relaxed">
          Sticks is a golf scoring &amp; on-course GPS app. When someone you know
          is out playing a round on Sticks, they can share it with you — and
          you&rsquo;ll get text updates on their pace, projected finish, ETA
          home, and (if they turn it on) their live scores. Sign up below to
          receive those texts.
        </p>
        <p className="text-[13px] text-faint mt-2 leading-relaxed">
          Texts are sent by Sticks from{" "}
          <strong className="text-mute">{BUSINESS.smsNumber}</strong>. Opting in
          is optional and never required to use Sticks.
        </p>
      </header>

      <SmsOptInForm />

      <section className="mt-8 space-y-3 text-[13px] leading-relaxed text-mute">
        <h2 className="font-display text-sm font-semibold text-ink">
          What to expect
        </h2>
        <ul className="space-y-1.5 list-disc pl-5">
          <li>
            <strong>Who sends them:</strong> Sticks, from{" "}
            <strong>{BUSINESS.smsNumber}</strong>.
          </li>
          <li>
            <strong>What we send:</strong> updates about rounds you&rsquo;ve
            asked to follow — pace of play, projected finish time, ETA home, and
            optional hole-by-hole scores.
          </li>
          <li>
            <strong>Message frequency</strong> varies and is recurring — you may
            receive several messages during an active round.
          </li>
          <li>
            <strong>Msg &amp; data rates may apply.</strong>
          </li>
          <li>
            <strong>Opt out any time</strong> by replying <strong>STOP</strong>.
            For help, reply <strong>HELP</strong> or email us at{" "}
            <a
              href="mailto:support@sticks-golf.app"
              className="underline hover:text-ink"
            >
              support@sticks-golf.app
            </a>
            .
          </li>
          <li>
            We <strong>never sell</strong> your phone number, and we do not share
            it with third parties or affiliates for their own marketing. See our{" "}
            <a href="/privacy" className="underline hover:text-ink">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/terms" className="underline hover:text-ink">
              Terms of Service
            </a>
            .
          </li>
        </ul>
      </section>

      <SiteFooter />
    </div>
  );
}
