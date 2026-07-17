import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/marketing/SiteFooter";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Contact · Sticks",
  description: "How to reach Sticks for support, questions, or feedback.",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto py-2">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        Contact us
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-mute">
        We&rsquo;re happy to help with support, account questions, or feedback
        about Sticks. The fastest way to reach us is email.
      </p>

      <div className="mt-6 card p-5 space-y-4 text-[14px]">
        <Row label="Business">
          {BUSINESS.legalName} · {BUSINESS.entityType}
        </Row>
        <Row label="Email">
          <a
            href={`mailto:${BUSINESS.email}`}
            className="underline hover:text-ink text-ink"
          >
            {BUSINESS.email}
          </a>
        </Row>
        <Row label="Phone">
          <a
            href={`tel:${BUSINESS.phoneHref}`}
            className="underline hover:text-ink text-ink"
          >
            {BUSINESS.phone}
          </a>
        </Row>
        <Row label="Location">{BUSINESS.location}</Row>
        <Row label="Website">
          <a
            href={BUSINESS.url}
            className="underline hover:text-ink text-ink"
          >
            {BUSINESS.domain}
          </a>
        </Row>
      </div>

      <div className="mt-6 space-y-3 text-[14px] leading-relaxed text-mute">
        <p>
          <strong className="text-ink">Text-message help.</strong> If you
          receive SMS updates from Sticks, reply <strong>STOP</strong> to any
          message to opt out, or <strong>HELP</strong> for help. You can also
          read how our text updates work on the{" "}
          <Link href="/sms" className="underline hover:text-ink">
            Text updates
          </Link>{" "}
          page. Message &amp; data rates may apply.
        </p>
        <p>
          See our{" "}
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

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <div className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-faint pt-0.5">
        {label}
      </div>
      <div className="text-mute">{children}</div>
    </div>
  );
}
