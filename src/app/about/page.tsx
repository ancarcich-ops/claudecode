import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/marketing/SiteFooter";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "About · Sticks",
  description:
    "Sticks is a golf scoring and on-course GPS app for keeping the group's scorecard, distances, and side games in one place.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto py-2">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        About Sticks
      </h1>

      <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-mute">
        <p>
          <strong className="text-ink">Sticks</strong> is a golf scoring and
          on-course GPS app. It gives a group one shared scorecard, satellite
          distances and hole maps, and automatic scoring for the side games
          golfers actually play — Skins, Wolf, Nassau, Stableford, Match play,
          Snake, Sixes, Bingo&nbsp;Bango&nbsp;Bongo, and team games — so the
          round keeps itself.
        </p>
        <p>
          Alongside scoring, Sticks keeps a running handicap index from your
          posted rounds, tracks your stats and history, and can send opt-in
          text updates to friends and family who want to follow along with a
          round&rsquo;s pace and finish.
        </p>

        <h2 className="font-display text-lg font-semibold text-ink pt-3">
          Who makes Sticks
        </h2>
        <p>
          Sticks is an independent product built and operated by{" "}
          {BUSINESS.proprietor} ({BUSINESS.entityType}), based in{" "}
          {BUSINESS.location}. It is not affiliated with any golf association,
          course, or handicap authority.
        </p>

        <h2 className="font-display text-lg font-semibold text-ink pt-3">
          Get in touch
        </h2>
        <p>
          Questions, support, or feedback? Email{" "}
          <a
            href={`mailto:${BUSINESS.email}`}
            className="underline hover:text-ink"
          >
            {BUSINESS.email}
          </a>{" "}
          or visit our{" "}
          <Link href="/contact" className="underline hover:text-ink">
            contact page
          </Link>
          . You can also review our{" "}
          <Link href="/privacy" className="underline hover:text-ink">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="underline hover:text-ink">
            Terms of Service
          </Link>
          .
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}
