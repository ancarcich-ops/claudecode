"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

// First-time-user nudge. Shown once per user (localStorage gate). Three
// quick screens: positioning -> create or join a group -> log your first
// match. Skippable; dismissed permanently via the X.
const STORAGE_KEY = "sticks.onboarded.v1";

const SLIDES = [
  {
    eyebrow: "Welcome to Sticks",
    title: "All your games.\nOne round.",
    body: "Net, Skins, Stableford, Nassau, Wolf, BBB, Snake — every game your group plays, tracked on the same scorecard with live odds moving in the background.",
    cta: "Next →",
  },
  {
    eyebrow: "Step 1",
    title: "Group up.",
    body: "Create a group for your foursome and share the invite code. Matches you post to a group are private to its members.",
    cta: "Next →",
  },
  {
    eyebrow: "Step 2",
    title: "Open a line.",
    body: "Post your tee time, pick the side games you're playing, and let the market move with the round. Mark Final when you're done — winners get the snapshot.",
    cta: "Open Sticks →",
  },
] as const;

export default function Onboarding({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      setVisible(true);
    } catch {
      // private mode: skip
    }
  }, [enabled]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  };

  const next = () => {
    if (idx >= SLIDES.length - 1) {
      dismiss();
      return;
    }
    setIdx(idx + 1);
  };

  if (!enabled) return null;
  const slide = SLIDES[idx];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            className="card p-6 max-w-md w-full relative"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Skip onboarding"
              className="absolute top-3 right-3 text-mute hover:text-ink text-xs"
            >
              Skip
            </button>
            <div className="text-[10px] uppercase tracking-wider text-accent mb-2">
              {slide.eyebrow}
            </div>
            <h2 className="font-display text-3xl font-semibold tracking-tight leading-tight whitespace-pre-line">
              {slide.title}
            </h2>
            <p className="text-sm text-mute mt-3 leading-relaxed">
              {slide.body}
            </p>
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-1.5">
                {SLIDES.map((_, i) => (
                  <span
                    key={i}
                    className={
                      "h-1.5 rounded-full transition-all " +
                      (i === idx ? "w-6 bg-accent" : "w-1.5 bg-border")
                    }
                  />
                ))}
              </div>
              {idx === SLIDES.length - 1 ? (
                <Link
                  href="/matches/new"
                  onClick={dismiss}
                  className="btn btn-primary text-sm"
                >
                  {slide.cta}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  className="btn btn-primary text-sm"
                >
                  {slide.cta}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
