"use client";

// Page-subtree error boundary. Catches render errors below the root
// layout, keeping the app shell (header, tab bar) intact and offering a
// retry instead of blanking the page. Root-layout / navigation errors
// fall through to global-error.tsx.

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page-error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="text-[11px] uppercase tracking-[0.14em] text-accent font-semibold">
        Something went sideways
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight mt-2">
        That shot found the trees.
      </h1>
      <p className="text-sm text-mute mt-2 leading-relaxed">
        This page hit an unexpected error. Try again — if it keeps happening,
        send us the code below.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="btn btn-primary text-sm"
        >
          Try again
        </button>
        <a href="/" className="btn btn-ghost text-sm">
          Home
        </a>
      </div>
      {(error.digest || error.message) && (
        <pre className="mt-6 text-[11px] text-faint whitespace-pre-wrap break-words font-mono">
          {error.digest ? `ref: ${error.digest}\n` : ""}
          {error.message || ""}
        </pre>
      )}
    </div>
  );
}
