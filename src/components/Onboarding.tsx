"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Avatar, { VARIANTS, type AvatarVariant } from "@/components/Avatar";
import {
  createGroupAction,
  joinGroupAction,
  updateAvatarConfigAction,
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
const STORAGE_KEY = "sticks.onboarded.v2";

type StepKey = "welcome" | "avatar" | "group" | "launch";
const STEPS: StepKey[] = ["welcome", "avatar", "group", "launch"];

export default function Onboarding({
  enabled,
  username,
}: {
  enabled: boolean;
  // Used as the avatar generator seed when the user hasn't picked one yet.
  username?: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [pending, startTransition] = useTransition();

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
            {(step === "welcome") && (
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
        One round.
      </h2>
      <p className="text-sm text-mute mt-3 max-w-sm mx-auto leading-relaxed">
        Score-tracking, six side games, and a live market that moves
        with every shot.
      </p>

      <div className="mt-6 space-y-2">
        <FeatureRow
          icon={<LiveDot />}
          title="Live odds"
          body="Win probabilities reprice as scores come in."
        />
        <FeatureRow
          icon={<GamesIcon />}
          title="Six side games"
          body="Stableford, Skins, Nassau, Wolf, BBB, Snake."
        />
        <FeatureRow
          icon={<GpsIcon />}
          title="GPS rangefinder"
          body="Yardages to the front, center, and back without leaving the app."
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
  onPicked,
}: {
  username: string;
  pending: boolean;
  onPicked: (variant: AvatarVariant) => void;
}) {
  const [selected, setSelected] = useState<AvatarVariant | null>(null);

  return (
    <div>
      <div className="text-center mt-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Pick your look.
        </h2>
        <p className="text-sm text-mute mt-1.5">
          Generated from your username. You can swap to a photo later in
          Settings.
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
        Post your tee time, pick the players, and the market opens.
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
