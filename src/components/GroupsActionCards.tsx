"use client";

// "Create a group" + "Join with a code" action cards for the
// redesigned /groups page. Client component so the primary buttons can
// disable until their field is valid (name non-empty / code complete),
// per the design handoff. Submission still goes through the existing
// server actions.

import { useState } from "react";
import { createGroupAction, joinGroupAction } from "@/lib/actions";

const FIELD_CLS =
  "flex-1 min-w-0 h-[50px] rounded-[12px] bg-panel2 border border-border px-[15px] text-[15px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--color-accent)/0.10)] transition-shadow";

// The primary "pressed key" button: a 2px ledge that collapses to 1px
// + a 1px downward translate on press.
const LEDGE_CLS =
  "h-[50px] px-[22px] rounded-[12px] bg-accent text-ink-on-accent font-sans font-bold text-[15px] shrink-0 shadow-[0_2px_0_rgb(var(--color-accentDim))] active:shadow-[0_1px_0_rgb(var(--color-accentDim))] active:translate-y-px disabled:opacity-50 disabled:shadow-none transition-[box-shadow,transform,opacity]";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono font-medium text-[10.5px] tracking-[0.14em] uppercase text-accent">
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-ink mt-1">
      {children}
    </h3>
  );
}

export function CreateGroupCard() {
  const [name, setName] = useState("");
  return (
    <section className="rounded-[16px] border border-border bg-panel p-[17px] pt-[18px]">
      <Eyebrow>Start something</Eyebrow>
      <CardTitle>Create a group</CardTitle>
      <form action={createGroupAction} className="flex gap-[9px] mt-[14px]">
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_CLS}
          placeholder="Saturday foursome, College buddies…"
          maxLength={40}
          required
        />
        <button type="submit" className={LEDGE_CLS} disabled={!name.trim()}>
          Create
        </button>
      </form>
      <p className="text-[12.5px] leading-normal text-mute mt-3">
        You&apos;ll get an invite code to share.{" "}
        <span className="text-ink font-semibold">
          Anyone with the code can join.
        </span>
      </p>
    </section>
  );
}

export function JoinGroupCard({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState((initialCode ?? "").toUpperCase());
  return (
    <section className="rounded-[16px] border border-border bg-panel p-[17px] pt-[18px]">
      <Eyebrow>Got an invite?</Eyebrow>
      <CardTitle>Join with a code</CardTitle>
      <form action={joinGroupAction} className="flex gap-[9px] mt-[14px]">
        <input
          name="inviteCode"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 6))
          }
          className={`${FIELD_CLS} font-mono tracking-[0.2em] uppercase`}
          placeholder="ABC123"
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          required
        />
        <button
          type="submit"
          className="h-[50px] px-[22px] rounded-[12px] bg-panel2 text-accent font-sans font-bold text-[15px] border border-border shrink-0 active:bg-panel disabled:opacity-50 transition-colors"
          disabled={code.length !== 6}
        >
          Join
        </button>
      </form>
      <p className="text-[12.5px] leading-normal text-mute mt-3">
        Ask a member to tap the code on any group above — it copies with
        a share link.
      </p>
    </section>
  );
}
