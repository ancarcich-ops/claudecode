"use client";

// Surfaces React render errors inline instead of letting Next.js show
// its blank "Application error: a client-side exception has occurred"
// fallback. Lives at the match-detail route so any crash in
// OnCourseMode / HoleMiniMap / HoleMiniMapGL surfaces the message +
// stack to the user, and gives them a Reset button to retry without a
// full page reload.

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the browser console for desktop debugging. On mobile the
    // inline UI is what the user sees.
    // eslint-disable-next-line no-console
    console.error("Match-page render error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-8 space-y-4 text-ink">
      <h1 className="font-display text-xl font-semibold">
        Something broke loading this match.
      </h1>
      <p className="text-sm text-mute">
        The page hit a render error. Tap Try again to retry without a
        full reload, or back out to the home feed.
      </p>
      <pre className="rounded-md border border-border bg-panel p-3 text-[11px] font-mono whitespace-pre-wrap break-words text-ink/90 max-h-80 overflow-auto">
        {error.message}
        {error.digest ? `\n\n[digest: ${error.digest}]` : ""}
        {error.stack ? `\n\n${error.stack}` : ""}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn btn-primary text-sm flex-1"
        >
          Try again
        </button>
        <a href="/" className="btn btn-ghost text-sm flex-1 text-center">
          Back to home
        </a>
      </div>
    </div>
  );
}
