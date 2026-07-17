import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getBirdieBoysTournament, BIRDIE_BOYS } from "@/lib/birdieBoys";
import SiteFooter from "@/components/marketing/SiteFooter";
import BirdieBoysRegisterForm from "./BirdieBoysRegisterForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Birdie Boys 2nd Annual — Sign up",
  description:
    "Sign up for the Birdie Boys 2nd Annual — a 2-Man Best Ball golf tournament at Goose Creek Golf Club, August 23, 2026. Presented by Sticks.",
};

// Flyer palette.
const NAVY = "#152A47";
const CREAM = "#F3E8CE";
const RED = "#B5382C";

export default async function BirdieBoysPage() {
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getBirdieBoysTournament(),
  ]);
  const roster = tournament?.roster ?? [];
  const myEntry = user ? roster.find((r) => r.userId === user.id) ?? null : null;

  return (
    <div className="space-y-8">
      {/* ===== Branded hero (mirrors the flyer) ===== */}
      <section
        className="overflow-hidden rounded-[20px]"
        style={{ background: NAVY, color: CREAM }}
      >
        <div className="flex flex-col items-center px-6 py-9 text-center sm:px-10 sm:py-12">
          <div
            className="font-mono text-[10px] uppercase tracking-[0.24em]"
            style={{ color: "rgba(243,232,206,.7)" }}
          >
            Presented by{" "}
            <span
              className="font-display font-bold"
              style={{ color: CREAM, letterSpacing: "-.01em" }}
            >
              Sticks<span style={{ color: RED }}>.</span>
            </span>
          </div>

          <h1
            className="mt-4 font-display font-extrabold leading-[0.86]"
            style={{ fontSize: "clamp(52px, 12vw, 84px)", letterSpacing: "-0.02em" }}
          >
            BIRDIE
            <br />
            BOYS
          </h1>

          <div className="mt-3 flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.28em]">
            <span style={{ color: RED }}>★</span> 2nd Annual{" "}
            <span style={{ color: RED }}>★</span>
          </div>
          <div className="mt-1 font-display text-[22px] font-semibold sm:text-2xl">
            Golf Tournament
          </div>

          {/* Mascot: a background image so a missing asset degrades to
              empty space (no broken-image icon). Drop the PNG at
              public/birdie-boys-mascot.png to light it up. */}
          <div
            aria-hidden
            className="my-6 h-[210px] w-[210px]"
            style={{
              backgroundImage: "url(/birdie-boys-mascot.png)",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          />

          <div
            className="font-mono text-[12px] uppercase tracking-[0.14em]"
            style={{ color: CREAM }}
          >
            <span style={{ color: RED }}>★</span> Format · {BIRDIE_BOYS.format}{" "}
            <span style={{ color: RED }}>★</span>
          </div>

          <div className="mt-6 font-display text-[26px] font-semibold italic">
            Goose Creek
            <span
              className="block font-mono text-[9px] not-italic tracking-[0.3em]"
              style={{ color: "rgba(243,232,206,.7)" }}
            >
              Golf Club
            </span>
          </div>
          <div className="mt-3 font-display text-[20px] font-bold">
            {BIRDIE_BOYS.dateLabel}
          </div>
          <div
            className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: "rgba(243,232,206,.62)" }}
          >
            {BIRDIE_BOYS.address}
          </div>

          <a
            href="#signup"
            className="mt-8 inline-block rounded-[3px] px-7 py-3 font-mono text-[11px] uppercase tracking-[0.2em]"
            style={{ background: RED, color: CREAM }}
          >
            {myEntry ? "You're signed up ✓" : "Sign up here"}
          </a>
        </div>
      </section>

      {/* ===== Sign-up / join ===== */}
      <section id="signup" className="mx-auto w-full max-w-md scroll-mt-20">
        <BirdieBoysRegisterForm
          loggedIn={!!user}
          username={user?.username ?? null}
          rosterNames={roster.map((r) => r.displayName)}
          registeredCount={roster.length}
          joined={!!myEntry}
          initialHandicap={myEntry?.handicapAtStart ?? null}
          initialPartner={myEntry?.partnerName ?? null}
          tournamentId={tournament?.id ?? null}
        />
        <p className="mt-4 text-center text-xs text-mute">
          Sticks is a golf scoring &amp; on-course GPS app. Signing up creates
          your free account and enters you in the tournament — tee times and
          pairings come later.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
