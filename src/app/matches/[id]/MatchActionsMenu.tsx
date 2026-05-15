"use client";

import { useEffect, useRef, useState } from "react";

export type MatchAction = {
  label: string;
  action: (formData: FormData) => Promise<void>;
  tone?: "default" | "danger";
};

// Server actions are imported by the parent and passed in as props, so this
// stays a pure client component without crossing the server/client import
// boundary itself.
export default function MatchActionsMenu({
  matchId,
  actions,
}: {
  matchId: string;
  actions: MatchAction[];
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (actions.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost h-8 w-8 px-0 shrink-0"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Match actions"
        title="Match actions"
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 min-w-[10rem] rounded-md border border-border bg-panel shadow-lg overflow-hidden"
          role="menu"
        >
          {actions.map((a, i) => (
            <form key={`${a.label}-${i}`} action={a.action}>
              <input type="hidden" name="matchId" value={matchId} />
              <button
                type="submit"
                onClick={() => setOpen(false)}
                className={
                  "block w-full text-left px-3 py-2 text-sm " +
                  (a.tone === "danger"
                    ? "text-danger hover:bg-danger/10"
                    : "text-ink hover:bg-panel2")
                }
                role="menuitem"
              >
                {a.label}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
