"use client";

import { useRef, useTransition } from "react";
import { BASELINE_HANDICAPS } from "@/lib/scoringBaseline";

// Shared dropdown that swaps the ?vs=N URL param controlling the
// handicap baseline used by both the Rounds Over Time chart and the
// Scoring Analysis section.
//
// Auto-submits on change so users don't have to hunt for the Apply
// button -- but Apply stays visible and clearly styled as a backup
// affordance and a visual cue for what just happened.
export default function BaselinePicker({
  selected,
  id,
}: {
  selected: number;
  // Caller-supplied unique id so we can have two pickers on one page
  // without colliding on the <label htmlFor>.
  id: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(() => {
      formRef.current?.submit();
    });
  };

  return (
    <form
      ref={formRef}
      action="/stats"
      className="flex items-center gap-1.5"
    >
      <label
        htmlFor={id}
        className="text-[10px] uppercase tracking-wider text-mute"
      >
        vs HI
      </label>
      <select
        id={id}
        name="vs"
        defaultValue={selected}
        onChange={submit}
        disabled={pending}
        className="bg-panel2 border border-border rounded-md text-ink text-xs font-mono tabular-nums px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {BASELINE_HANDICAPS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent text-ink-on-accent px-2 py-1 text-[10px] uppercase tracking-wider font-semibold hover:bg-accentDim transition-colors disabled:opacity-60"
      >
        {pending ? "…" : "Apply"}
      </button>
    </form>
  );
}
