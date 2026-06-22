"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { placeWagerAction } from "@/lib/actions";

// Inline button surfaced on the home grid next to a player's hcp label.
// Two-tap confirm pattern so a stray tap doesn't fire a wager:
//   tap 1  -> arms (turns accent, shows "Confirm?")
//   tap 2  -> POSTs placeWagerAction, toasts, settles to "Picked"
//
// Disarms itself after 3s of idle. If the player is already the
// viewer's current pick, the button degrades to a static "Picked"
// chip; the user re-arms a different player to switch.
//
// Sits inside the parent <Link> wrapper, so every click stopPropagation
// so the card doesn't navigate out from under the button.
export default function QuickWagerButton({
  matchId,
  pickedPlayerId,
  playerName,
  isMyPick,
  disabled,
}: {
  matchId: string;
  pickedPlayerId: string;
  playerName: string;
  isMyPick: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (isMyPick) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent"
        title="Your current call on this match"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Picked
      </span>
    );
  }

  const submit = (e: React.MouseEvent) => {
    stop(e);
    if (disabled) return;
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed((cur) => (cur ? false : cur)), 3000);
      return;
    }
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("pickedPlayerId", pickedPlayerId);
    startTransition(async () => {
      try {
        await placeWagerAction(fd);
        toast.success(`Called ${playerName}.`);
        setArmed(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't place call.",
        );
        setArmed(false);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={submit}
      disabled={pending || disabled}
      aria-label={armed ? `Confirm call on ${playerName}` : `Call ${playerName}`}
      className={
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors border " +
        (armed
          ? "bg-accent text-ink-on-accent border-accent"
          : "bg-panel2 text-mute border-border hover:text-ink hover:border-accent/40")
      }
    >
      {pending ? (
        "…"
      ) : armed ? (
        "Confirm?"
      ) : (
        <>
          <span aria-hidden>+</span>
          Call
        </>
      )}
    </button>
  );
}
