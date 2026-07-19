"use client";

import { useState, useTransition } from "react";
import { setAutoAcceptFollowsAction } from "@/lib/actions";

// Toggle: auto-accept incoming follow requests (a "public" profile).
// Off by default -- you approve each follower. Turning it on also
// approves anyone currently waiting (handled server-side).
export default function FollowSettingsCard({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    const fd = new FormData();
    fd.set("autoAccept", next ? "on" : "off");
    start(async () => {
      await setAutoAcceptFollowsAction(fd);
    });
  };

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink">
            Auto-accept followers
          </h2>
          <p className="text-sm text-mute mt-1">
            When on, anyone can follow you without approval and will see your
            rounds in their feed. When off, you approve each request.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Auto-accept followers"
          onClick={toggle}
          disabled={pending}
          className={
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 " +
            (on ? "bg-accent" : "bg-panel2 border border-border")
          }
        >
          <span
            className={
              "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform " +
              (on ? "translate-x-6" : "translate-x-1")
            }
          />
        </button>
      </div>
    </section>
  );
}
