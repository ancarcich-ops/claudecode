import Link from "next/link";
import { BUSINESS } from "@/lib/business";

// Shared footer for the public-facing pages (marketing landing, About,
// Contact, Privacy, Terms, Text updates). Carries the legal name,
// domain-matched contact, and the full set of legal/company links so an
// established-business review can find them from anywhere on the site.
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-border pt-8 pb-4 text-[13px] text-mute">
      <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
        <div className="max-w-xs">
          <div className="font-display text-base font-semibold text-ink">
            {BUSINESS.name}
            <span className="text-accent">.</span>
          </div>
          <p className="mt-1.5 leading-relaxed">
            A golf scoring &amp; on-course GPS app that scores your side games
            and keeps the group in the loop.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-10 gap-y-1.5">
          <div className="flex flex-col gap-1.5">
            <FooterLabel>Company</FooterLabel>
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
            <FooterLink href="/sms">Text updates</FooterLink>
          </div>
          <div className="flex flex-col gap-1.5">
            <FooterLabel>Legal</FooterLabel>
            <FooterLink href="/privacy">Privacy Policy</FooterLink>
            <FooterLink href="/terms">Terms of Service</FooterLink>
            <FooterLink href="/login">Sign in</FooterLink>
          </div>
        </nav>
      </div>

      <div className="mt-8 flex flex-col gap-1 border-t border-border pt-4 text-[12px] text-faint">
        <div>
          © {year} {BUSINESS.legalName}. All rights reserved.
        </div>
        <div>
          {BUSINESS.location} ·{" "}
          <a
            href={`mailto:${BUSINESS.email}`}
            className="underline hover:text-ink"
          >
            {BUSINESS.email}
          </a>{" "}
          ·{" "}
          <a
            href={`tel:${BUSINESS.phoneHref}`}
            className="underline hover:text-ink"
          >
            {BUSINESS.phone}
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
      {children}
    </span>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="hover:text-ink hover:underline w-fit">
      {children}
    </Link>
  );
}
