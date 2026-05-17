"use client";

import { useTransition } from "react";
import { toast } from "sonner";

// Reusable share affordance. Tries the platform native share sheet
// (Web Share API) first; falls back to a clipboard copy with a toast.
// Wraps both in a transition so the button reflects pending state on
// slow clipboard writes.
export default function ShareButton({
  url,
  title,
  text,
  label = "Share",
  className,
}: {
  // Path or absolute URL. Path strings get prefixed with the current
  // origin so the result is always shareable across devices.
  url: string;
  title?: string;
  text?: string;
  label?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (typeof window === "undefined") return;
    const fullUrl = url.startsWith("http")
      ? url
      : `${window.location.origin}${url}`;
    startTransition(async () => {
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({ url: fullUrl, title, text });
        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(fullUrl);
          toast.success("Link copied.");
        } else {
          // Older browser fallback: prompt() so the user can copy.
          window.prompt("Copy this link:", fullUrl);
        }
      } catch (err) {
        // navigator.share rejects with AbortError when the user
        // cancels -- swallow it. Anything else gets toasted.
        if (
          err instanceof Error &&
          err.name !== "AbortError" &&
          err.name !== "NotAllowedError"
        ) {
          toast.error("Couldn't share.");
        }
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-mute hover:text-ink transition-colors px-2 py-1 rounded-md border border-border hover:border-accent/40"
      }
      aria-label={label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {pending ? "…" : label}
    </button>
  );
}
