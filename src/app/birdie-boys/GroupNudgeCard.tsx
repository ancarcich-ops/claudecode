"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createGroupAction } from "@/lib/actions";

// Persistent, always-visible nudge on the Birdie Boys "You're in"
// confirmation: an optional way to get your regular crew onto Sticks by
// creating a group. Clearly separate from (and not required for) the
// tournament -- shows on the page regardless of onboarding history.
export default function GroupNudgeCard() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<string | null>(null);

  const submit = () => {
    const n = name.trim();
    if (n.length < 2) return;
    const fd = new FormData();
    fd.set("name", n);
    start(async () => {
      try {
        await createGroupAction(fd);
        setCreated(n);
        toast.success(`Group "${n}" created.`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Couldn't create group.",
        );
      }
    });
  };

  if (created) {
    return (
      <section className="card p-5 text-center">
        <h2 className="font-display text-lg font-semibold text-ink">
          Group &ldquo;{created}&rdquo; is ready 🎉
        </h2>
        <p className="text-sm text-mute mt-1.5">
          Invite your crew and every round you play together lives in one
          place.
        </p>
        <Link href="/groups" className="btn btn-primary text-sm mt-4">
          Invite your group →
        </Link>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <span className="chip text-[10px]">Optional · not required for the tournament</span>
      <h2 className="mt-2.5 font-display text-lg font-semibold text-ink">
        Bring your crew to Sticks
      </h2>
      <p className="text-sm text-mute mt-1.5">
        You&rsquo;re all set for Birdie Boys. Separately, Sticks is built around
        <span className="text-ink font-medium"> groups</span> — make one to get
        your regular golf crew on the app, invite them, and keep all your rounds
        together. Totally optional, and you can do it anytime.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Group name (e.g. The Foursome Group)"
          className="flex-1 rounded-[11px] border border-border bg-panel2 px-3.5 py-3 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
        <button
          type="button"
          disabled={pending || name.trim().length < 2}
          onClick={submit}
          className="btn btn-primary disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create group"}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-mute">
        Already have a group?{" "}
        <Link href="/groups" className="text-accent hover:underline">
          Join with a code →
        </Link>
      </p>
    </section>
  );
}
