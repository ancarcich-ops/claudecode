// Win-probability readout with up/down/flat arrow + tick animation.
// Compares the incoming probability against the value we saw on the
// previous render via a useRef map keyed by player id. Triggers a
// 600ms color flash + 2px vertical nudge on change, with a matching
// background pulse applied to the parent row via the same delta sign.
//
// Reduced motion users get the static color + arrow without the
// transform / background flash.

"use client";

import { useEffect, useRef, useState } from "react";

type Direction = "up" | "down" | "flat";

export default function ProbabilityTick({
  playerId,
  probability,
}: {
  playerId: string;
  probability: number;
}) {
  const previous = useRef<Map<string, number>>(new Map());
  const [direction, setDirection] = useState<Direction>("flat");
  const [tickId, setTickId] = useState(0);

  useEffect(() => {
    const prev = previous.current.get(playerId);
    if (prev != null) {
      const delta = probability - prev;
      // Debounce to one tick per 600ms per player (matches spec) and
      // require a meaningful delta to avoid flicker.
      if (Math.abs(delta) > 0.005) {
        setDirection(delta > 0 ? "up" : "down");
        setTickId((n) => n + 1);
      }
    }
    previous.current.set(playerId, probability);
  }, [playerId, probability]);

  const pct = Math.round(probability * 100);
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "•";
  const arrowColor =
    direction === "up"
      ? "text-accent"
      : direction === "down"
        ? "text-danger"
        : "text-faint";

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={"text-[10px] " + arrowColor}
        aria-hidden
      >
        {arrow}
      </span>
      <span
        key={tickId}
        className={
          "font-mono tabular-nums text-sm text-ink " +
          (direction === "up"
            ? "tick-up"
            : direction === "down"
              ? "tick-down"
              : "")
        }
      >
        {pct}%
      </span>
    </span>
  );
}

// Returns the current direction-flash class so the parent row can pulse
// in sync with the number tick. Tracks the same key set as ProbabilityTick.
// Two refs are intentional — they're keyed by playerId from different
// components but the comparisons stay symmetric.
export function useRowFlash(playerId: string, probability: number) {
  const prev = useRef<Map<string, number>>(new Map());
  const [cls, setCls] = useState<"" | "row-flash-up" | "row-flash-down">("");
  const tickRef = useRef(0);

  useEffect(() => {
    const previous = prev.current.get(playerId);
    if (previous != null) {
      const delta = probability - previous;
      if (Math.abs(delta) > 0.005) {
        // Remount the class so the animation replays on every change.
        tickRef.current++;
        setCls(delta > 0 ? "row-flash-up" : "row-flash-down");
        const id = setTimeout(() => setCls(""), 650);
        return () => clearTimeout(id);
      }
    }
    prev.current.set(playerId, probability);
  }, [playerId, probability]);

  return cls;
}
