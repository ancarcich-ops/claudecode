import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import {
  getBirdieBoysTournament,
  reconcileBirdieBoysOwner,
  BIRDIE_BOYS,
} from "@/lib/birdieBoys";
import SiteFooter from "@/components/marketing/SiteFooter";
import BirdieBoysRegisterForm from "./BirdieBoysRegisterForm";
import GroupNudgeCard from "./GroupNudgeCard";

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

// The four stat cells from the flyer (last year's honors + format).
const STATS: { k: string; v: string }[] = [
  { k: "Format", v: "2-Man Best Ball" },
  { k: "Reigning Champ", v: "Travis + Cam" },
  { k: "Longest Drive", v: "Jordan · 304 yds" },
  { k: "Closest to Pin", v: "Will · 2 ft" },
];

export default async function BirdieBoysPage() {
  // Re-home the tournament to the configured BIRDIE_BOYS_OWNER if needed
  // (no-op once ownership is correct) so the admin can be set after the
  // fact just by loading this page.
  await reconcileBirdieBoysOwner();
  const [user, tournament] = await Promise.all([
    getCurrentUser(),
    getBirdieBoysTournament(),
  ]);
  const roster = tournament?.roster ?? [];
  const myEntry = user ? roster.find((r) => r.userId === user.id) ?? null : null;

  return (
    <div className="space-y-8">
      {/* ===== Poster hero (mirrors flyer Option D) ===== */}
      <div className="mx-auto w-full max-w-[520px]">
        <div
          className="relative overflow-hidden rounded-[18px]"
          style={{ background: CREAM }}
        >
          {/* Red double-rule poster frame */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[11px] z-20 rounded-[6px]"
            style={{ border: `1.5px solid ${RED}` }}
          >
            <div
              className="absolute inset-[4px] rounded-[4px]"
              style={{ border: `0.75px solid rgba(181,56,44,.55)` }}
            />
          </div>

          {/* Navy top — headline, angled bottom edge */}
          <div
            className="relative px-8 pt-10 text-center"
            style={{
              background: NAVY,
              color: CREAM,
              clipPath: "polygon(0 0, 100% 0, 100% 90%, 0 100%)",
              paddingBottom: 72,
            }}
          >
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
              style={{ fontSize: "clamp(50px, 15vw, 74px)", letterSpacing: "-0.02em" }}
            >
              BIRDIE
              <br />
              BOYS
            </h1>

            <div className="mt-3 flex items-center justify-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.28em]">
              <span style={{ color: RED }}>★</span> 2nd Annual{" "}
              <span style={{ color: RED }}>★</span>
            </div>
            <div className="mt-1 font-display text-[22px] font-semibold sm:text-2xl">
              Golf Tournament
            </div>
          </div>

          {/* Mascot straddling the navy → cream seam. Background image so a
              missing asset degrades to empty space (no broken-image icon).
              Drop the PNG at public/birdie-boys-mascot.png. */}
          <div
            aria-hidden
            className="relative z-10 mx-auto -mt-16 h-[190px] w-[190px]"
            style={{
              backgroundImage: "url(/birdie-boys-mascot.png)",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          />

          {/* Cream bottom — stats grid, venue, date, CTA */}
          <div
            className="px-7 pb-10 pt-1 text-center"
            style={{ color: NAVY }}
          >
            <div
              className="grid grid-cols-2 text-left"
              style={{ border: `1.5px solid ${NAVY}` }}
            >
              {STATS.map((s, i) => (
                <div
                  key={s.k}
                  className="px-3 py-2.5"
                  style={{
                    borderLeft: i % 2 === 1 ? `1.5px solid ${NAVY}` : undefined,
                    borderTop: i >= 2 ? `1.5px solid ${NAVY}` : undefined,
                  }}
                >
                  <div
                    className="font-mono text-[8px] uppercase tracking-[0.16em]"
                    style={{ color: RED }}
                  >
                    {s.k}
                  </div>
                  <div className="mt-1 font-display text-[13px] font-bold uppercase leading-tight">
                    {s.v}
                  </div>
                </div>
              ))}
            </div>

            {/* Goose Creek logo (background image → graceful if missing),
                with the name as an always-visible caption. Drop the PNG at
                public/goose-creek-logo.png. */}
            <div
              aria-label="Goose Creek Golf Club"
              className="mx-auto mt-6 h-[46px] w-[150px]"
              style={{
                backgroundImage: "url(/goose-creek-logo.png)",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
            <div className="mt-2 font-display text-[15px] font-semibold italic">
              Goose Creek Golf Club
            </div>

            <div className="mt-4 font-display text-[20px] font-bold">
              {BIRDIE_BOYS.dateLabel}
            </div>
            <div
              className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em]"
              style={{ color: "rgba(21,42,71,.62)" }}
            >
              {BIRDIE_BOYS.address}
            </div>

            <a
              href="#signup"
              className="mt-6 inline-block rounded-[3px] px-8 py-3 font-mono text-[11px] uppercase tracking-[0.2em]"
              style={{ background: RED, color: CREAM }}
            >
              {myEntry ? "You're signed up ✓" : "Sign up here"}
            </a>
          </div>
        </div>
      </div>

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
        {myEntry && (
          <div className="mt-6">
            <GroupNudgeCard />
          </div>
        )}
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
