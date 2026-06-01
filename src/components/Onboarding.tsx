"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Avatar, { VARIANTS, type AvatarVariant } from "@/components/Avatar";
import {
  createGroupAction,
  joinGroupAction,
  updateAvatarConfigAction,
  uploadAvatarAction,
} from "@/lib/actions";

// Multi-step first-launch flow. Each step does something real (not just
// informational) so the user lands on the home page with their profile
// already wired up. Mobbin's "Welcome & Get Started" patterns we follow:
//
//   - Single primary CTA pinned to the bottom on mobile
//   - Skip top-right always available
//   - Progress dots that fill as you advance
//   - One step per concept, not crammed
//   - Each step has a "hero" visual region above text
//
// Bumping the storage key on schema changes -- v1 users see this once.
const STORAGE_KEY = "sticks.onboarded.v3";

type StepKey = "welcome" | "avatar" | "group" | "card-guide" | "launch";
const ALL_STEPS: StepKey[] = ["welcome", "avatar", "group", "card-guide", "launch"];

export default function Onboarding({
  enabled,
  username,
  // True when the user is already a member of at least one group --
  // we drop the "create / join a group" step in that case so users
  // who arrived via an invite-link signup aren't asked for a code
  // they already used.
  hasGroup = false,
  photoUploadEnabled = false,
}: {
  enabled: boolean;
  // Used as the avatar generator seed when the user hasn't picked one yet.
  username?: string;
  hasGroup?: boolean;
  // True when BLOB_READ_WRITE_TOKEN is configured server-side; gates the
  // photo-upload affordance in the avatar step.
  photoUploadEnabled?: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [pending, startTransition] = useTransition();

  // STEPS is derived from the user's current state so the group step
  // disappears entirely for users who joined via an invite link. The
  // progress dots, advance() logic, and back navigation all read from
  // this filtered list -- no other branching needed.
  const STEPS = ALL_STEPS.filter((s) => !(s === "group" && hasGroup));

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      setVisible(true);
    } catch {
      // private mode: skip silently
    }
  }, [enabled]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  };

  const advance = () => {
    if (stepIdx >= STEPS.length - 1) {
      dismiss();
      return;
    }
    setStepIdx(stepIdx + 1);
  };

  const goBack = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  if (!enabled) return null;
  const step = STEPS[stepIdx];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            className="bg-panel sm:rounded-lg sm:border sm:border-border w-full sm:max-w-lg flex flex-col relative overflow-hidden"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Header
              stepIdx={stepIdx}
              total={STEPS.length}
              onSkip={dismiss}
              onBack={stepIdx > 0 ? goBack : null}
            />

            <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6 sm:pb-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  {step === "welcome" && <WelcomeStep />}
                  {step === "avatar" && (
                    <AvatarStep
                      username={username ?? "you"}
                      pending={pending}
                      photoUploadEnabled={photoUploadEnabled}
                      onPicked={(variant) => {
                        const fd = new FormData();
                        fd.set("variant", variant);
                        startTransition(async () => {
                          try {
                            await updateAvatarConfigAction(fd);
                            advance();
                          } catch {
                            toast.error("Couldn't save avatar — moving on.");
                            advance();
                          }
                        });
                      }}
                      onUpload={(file) => {
                        const fd = new FormData();
                        fd.set("file", file);
                        startTransition(async () => {
                          try {
                            await uploadAvatarAction(fd);
                            toast.success("Photo saved.");
                            advance();
                          } catch (e) {
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Upload failed.",
                            );
                          }
                        });
                      }}
                    />
                  )}
                  {step === "group" && (
                    <GroupStep
                      pending={pending}
                      onCreate={(name) => {
                        const fd = new FormData();
                        fd.set("name", name);
                        startTransition(async () => {
                          try {
                            await createGroupAction(fd);
                            toast.success(`Group "${name}" created.`);
                            advance();
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Couldn't create group.",
                            );
                          }
                        });
                      }}
                      onJoin={(code) => {
                        const fd = new FormData();
                        fd.set("code", code);
                        startTransition(async () => {
                          try {
                            await joinGroupAction(fd);
                            toast.success("Joined group.");
                            advance();
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Couldn't join group.",
                            );
                          }
                        });
                      }}
                      onSkip={advance}
                    />
                  )}
                  {step === "card-guide" && <CardGuideStep />}
                  {step === "launch" && (
                    <LaunchStep
                      onPostMatch={() => {
                        dismiss();
                        router.push("/matches/new");
                      }}
                      onHome={dismiss}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer CTA only for steps without their own inline submit */}
            {step === "welcome" && (
              <Footer>
                <button
                  type="button"
                  onClick={advance}
                  className="btn btn-primary w-full"
                >
                  Get started →
                </button>
              </Footer>
            )}
            {step === "card-guide" && (
              <Footer>
                <button
                  type="button"
                  onClick={advance}
                  className="btn btn-primary w-full"
                >
                  Got it →
                </button>
              </Footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Header({
  stepIdx,
  total,
  onSkip,
  onBack,
}: {
  stepIdx: number;
  total: number;
  onSkip: () => void;
  onBack: null | (() => void);
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
      <div className="w-12">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-mute hover:text-ink text-sm"
            aria-label="Previous step"
          >
            ←
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={
              "h-1.5 rounded-full transition-all " +
              (i === stepIdx
                ? "w-6 bg-accent"
                : i < stepIdx
                  ? "w-1.5 bg-accent/60"
                  : "w-1.5 bg-border")
            }
          />
        ))}
      </div>
      <div className="w-12 text-right">
        <button
          type="button"
          onClick={onSkip}
          className="text-mute hover:text-ink text-xs uppercase tracking-wider"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-t border-border bg-panel shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

// ----- Step 1: Welcome -----------------------------------------------------

function WelcomeStep() {
  return (
    <div className="text-center">
      <div className="mt-2 flex justify-center">
        <BrandLogo />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-accent mt-5">
        Welcome to Sticks
      </div>
      <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mt-2">
        All your games.
        <br />
        One app.
      </h2>
      <p className="text-sm text-mute mt-3 max-w-sm mx-auto leading-relaxed">
        Score-tracking, every side game imaginable, and a live market that
        moves with every shot — instantly keep up with all your friends&apos;
        golf rounds.
      </p>

      <div className="mt-6 space-y-2">
        <FeatureRow
          icon={<LiveDot />}
          title="Live odds"
          body="Match win probabilities reprice as your group picks sides and as scores come in during the round."
        />
        <FeatureRow
          icon={<GamesIcon />}
          title="Every game in your group"
          body="Stableford, Skins, Nassau, Match, Sixes, Targets, Wolf, BBB, Snake. Plus team formats — Best Ball, High/Low, Vegas, Sum, Aggregate Net — with a live team leaderboard above the scorecard."
        />
        <FeatureRow
          icon={<TrophyIcon />}
          title="Group leaderboard"
          body="Claim bragging rights — most wins, reigning champion, head-to-head records, and current streaks across your foursome."
        />
        <FeatureRow
          icon={<ChartIcon />}
          title="Personal stats"
          body="Auto-tracked Sticks index, performance by par 3 / 4 / 5, birdie-through-double distribution, and how you stack up vs the handicap you target."
        />
        <FeatureRow
          icon={<GpsIcon />}
          title="Satellite GPS, 350+ courses"
          body="Live distances to the green plus a pre-round preview of every hole — for every course we've mapped."
        />
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-panel2 px-3 py-2.5 text-left">
      <span className="text-accent shrink-0 mt-0.5">{icon}</span>
      <div>
        <div className="text-sm font-medium text-ink leading-tight">
          {title}
        </div>
        <div className="text-[11px] text-mute mt-0.5 leading-snug">
          {body}
        </div>
      </div>
    </div>
  );
}

// ----- Step 2: Avatar ------------------------------------------------------

function AvatarStep({
  username,
  pending,
  photoUploadEnabled,
  onPicked,
  onUpload,
}: {
  username: string;
  pending: boolean;
  photoUploadEnabled: boolean;
  onPicked: (variant: AvatarVariant) => void;
  onUpload: (file: File) => void;
}) {
  const [selected, setSelected] = useState<AvatarVariant | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickFile = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    onUpload(f);
    // Reset so the same file can be picked again after a failed upload.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <div className="text-center mt-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Pick your look.
        </h2>
        <p className="text-sm text-mute mt-1.5">
          Generated from your username. Or upload your own photo.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-6">
        {VARIANTS.map((v) => {
          const active = selected === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setSelected(v)}
              aria-pressed={active}
              className={
                "flex flex-col items-center gap-1.5 p-2 rounded-md border transition-colors " +
                (active
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-accent/40")
              }
            >
              <Avatar seed={username} variant={v} size={56} />
              <span
                className={
                  "text-[10px] uppercase tracking-wider " +
                  (active ? "text-accent" : "text-mute")
                }
              >
                {v}
              </span>
            </button>
          );
        })}
      </div>

      {photoUploadEnabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFileChange}
            className="hidden"
          />
          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-mute">
              or
            </span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <button
            type="button"
            onClick={pickFile}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-panel hover:border-accent/40 hover:text-ink text-mute px-3 py-3 text-sm transition-colors disabled:opacity-50"
          >
            <UploadIcon />
            {pending ? "Uploading…" : "Upload a photo"}
          </button>
        </>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          disabled={!selected || pending}
          onClick={() => selected && onPicked(selected)}
          className="btn btn-primary w-full disabled:opacity-50"
        >
          {pending ? "Saving…" : selected ? "Save & continue →" : "Pick one to continue"}
        </button>
      </div>
    </div>
  );
}

// ----- Step 3: Group -------------------------------------------------------

function GroupStep({
  pending,
  onCreate,
  onJoin,
  onSkip,
}: {
  pending: boolean;
  onCreate: (name: string) => void;
  onJoin: (code: string) => void;
  onSkip: () => void;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <div>
      <div className="text-center mt-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Bring your foursome.
        </h2>
        <p className="text-sm text-mute mt-1.5 max-w-sm mx-auto">
          Matches you post to a group stay private to its members. Solo&apos;s
          fine too — you can do this later.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <ToggleButton
          label="Create new"
          active={mode === "create"}
          onClick={() => setMode("create")}
        />
        <ToggleButton
          label="Join with code"
          active={mode === "join"}
          onClick={() => setMode("join")}
        />
      </div>

      <div className="mt-4">
        {mode === "create" ? (
          <>
            <label htmlFor="ob-group-name" className="label">
              Group name
            </label>
            <input
              id="ob-group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Foursome Group"
              maxLength={40}
              className="input"
            />
          </>
        ) : (
          <>
            <label htmlFor="ob-group-code" className="label">
              Invite code
            </label>
            <input
              id="ob-group-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. TFG-1234"
              maxLength={20}
              className="input uppercase tracking-wider font-mono"
            />
          </>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          disabled={
            pending ||
            (mode === "create" ? name.trim().length < 2 : code.trim().length < 3)
          }
          onClick={() =>
            mode === "create" ? onCreate(name.trim()) : onJoin(code.trim())
          }
          className="btn btn-primary w-full disabled:opacity-50"
        >
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Joining…"
            : mode === "create"
              ? "Create group →"
              : "Join group →"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs uppercase tracking-wider text-mute hover:text-ink py-2"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "border-accent bg-accent/10 text-ink"
          : "border-border bg-panel2 text-mute hover:text-ink")
      }
    >
      {label}
    </button>
  );
}

// ----- Step 4: Launch ------------------------------------------------------

// ----- Step 4: Reading the card -------------------------------------------
// Tiny legend so first-time users decode the live match card on the home
// page without trial and error. Each row pairs a real-shaped icon with
// a one-line plain-English explanation.

function CardGuideStep() {
  return (
    <div>
      <div className="text-center mt-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Reading the card.
        </h2>
        <p className="text-sm text-mute mt-1.5 max-w-sm mx-auto">
          A quick decoder for what every chip, dot, and number means on
          the home page.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        <Legend
          icon={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5">
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-accent">
                Live
              </span>
            </span>
          }
          label="Live status pill"
          body="A round is in progress right now. Sky-blue 'In 2h 14m' = upcoming. Gold 'Final' = settled."
        />

        <Legend
          icon={
            <div className="flex items-center gap-0.5">
              <Dot tone="birdie" />
              <Dot tone="par" />
              <Dot tone="bogey" />
              <Dot tone="double" />
              <Dot tone="current" />
              <Dot tone="unplayed" />
            </div>
          }
          label="Hole dot row"
          body={
            <>
              Each played box shows your raw <span className="text-ink">strokes</span> for the hole. Color hints at par:{" "}
              <span className="text-accent">solid emerald</span> = birdie · <span className="text-gold">gold</span> = eagle ·{" "}
              <span className="text-accent">soft green</span> = par ·{" "}
              <span className="text-danger">muted red</span> = bogey ·{" "}
              <span className="text-danger">bright red + halo</span> = double or worse. Dashed border = current hole, empty = unplayed.
            </>
          }
        />

        <Legend
          icon={
            <span className="font-mono tabular-nums text-sm text-ink">
              <span className="text-accent" aria-hidden>▲</span> 63%
            </span>
          }
          label="Win probability"
          body="Live odds based on scores + group calls. The arrow shows the last move (▲ rising, ▼ falling, • flat)."
        />

        <Legend
          icon={
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-mute border border-border bg-panel2">
              <span aria-hidden>+</span>
              Call
            </span>
          }
          label="+ Call button"
          body="Choose who you think will win the match. Two taps to confirm — switches to a ✓ Picked badge after."
        />

        <Legend
          icon={
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/30 px-2 py-0.5">
              <span aria-hidden className="flicker">🔥</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                3 birdies
              </span>
            </span>
          }
          label="Momentum badges"
          body="🔥 hot = ≥3 birdies in a round. ❄️ cold = +4 over par across last 3. 🦅 = eagle on the most recent. 🐥 = birdie on the most recent."
        />

        <Legend
          icon={<SparklineIcon />}
          label="Sparkline"
          body="Tiny chart of running net-to-par across the holes a player has scored. Higher line = better stretch."
        />

        <Legend
          icon={
            <span className="font-mono text-[9px] uppercase tracking-wider text-mute">
              … LEADER &minus;2 THRU 12 · 1 WAGER …
            </span>
          }
          label="Header ticker"
          body="Scrolling strip of live odds and recent events. Adapts to whether the round is open, live, or settled."
        />
      </div>
    </div>
  );
}

function Legend({
  icon,
  label,
  body,
}: {
  icon: React.ReactNode;
  label: string;
  body: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-start gap-3 rounded-md border border-border bg-panel2 px-3 py-2.5">
      <div className="flex items-center justify-center min-h-[1.5rem]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink leading-tight">
          {label}
        </div>
        <div className="text-[11px] text-mute leading-snug mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function Dot({
  tone,
}: {
  tone: "birdie" | "par" | "bogey" | "double" | "current" | "unplayed";
}) {
  const cls = (() => {
    switch (tone) {
      case "birdie":
        return "bg-accent";
      case "par":
        return "bg-mute/30 border border-mute/30";
      case "bogey":
        return "bg-danger/70";
      case "double":
        return "bg-danger";
      case "current":
        return "border border-dashed border-accent bg-accent/10";
      default:
        return "border border-border";
    }
  })();
  return <span className={"w-3 h-3 rounded-[2px] " + cls} aria-hidden />;
}

function SparklineIcon() {
  return (
    <svg width="56" height="16" viewBox="0 0 56 16" aria-hidden>
      <defs>
        <linearGradient id="ob-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points="2,14 2,8 12,6 22,9 32,5 42,7 54,4 54,14"
        fill="url(#ob-spark)"
      />
      <polyline
        points="2,8 12,6 22,9 32,5 42,7 54,4"
        fill="none"
        stroke="rgb(var(--color-accent))"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="54" cy="4" r="1.4" fill="rgb(var(--color-accent))" />
    </svg>
  );
}

function LaunchStep({
  onPostMatch,
  onHome,
}: {
  onPostMatch: () => void;
  onHome: () => void;
}) {
  return (
    <div className="text-center">
      <div className="mt-4 flex justify-center">
        <div className="relative">
          <BrandLogo />
          <span className="absolute -top-2 -right-3 text-2xl select-none">
            ✨
          </span>
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-accent mt-5">
        You&apos;re set
      </div>
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight mt-2">
        Time to open a line.
      </h2>
      <p className="text-sm text-mute mt-3 max-w-sm mx-auto leading-relaxed">
        Post your tee time, pick the players, and the round starts.
        Score during the round; everyone watching sees the line move.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onPostMatch}
          className="btn btn-primary w-full"
        >
          Post your first round →
        </button>
        <button
          type="button"
          onClick={onHome}
          className="text-xs uppercase tracking-wider text-mute hover:text-ink py-2"
        >
          Take me home
        </button>
      </div>
    </div>
  );
}

// ----- Decorative bits -----------------------------------------------------

function BrandLogo() {
  return (
    <svg
      width="60"
      height="60"
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden
      className="text-accent"
    >
      <rect x="13" y="14" width="8" height="40" rx="2.5" />
      <rect x="28" y="6" width="8" height="50" rx="2.5" />
      <rect x="43" y="22" width="8" height="28" rx="2.5" />
    </svg>
  );
}

function LiveDot() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

function GamesIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function GpsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M17 4h3v2a3 3 0 0 1-3 3" />
      <path d="M7 4H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
