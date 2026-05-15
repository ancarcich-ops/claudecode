"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

// Fired client-side when a match status transitions to COMPLETED. Reads
// the previous status from a data attribute the server sets, so we only
// celebrate once per visit -- not every render.
//
// Trigger: the match-detail page renders this component with the current
// status. On mount/update, if status === 'COMPLETED' and we haven't yet
// celebrated this matchId in this tab, fire confetti and remember it.
export default function WinCelebration({
  matchId,
  status,
}: {
  matchId: string;
  status: string;
}) {
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status !== "COMPLETED") return;
    if (fired.current.has(matchId)) return;
    // sessionStorage gate so a hard refresh on a settled match doesn't
    // re-trigger confetti -- only fresh transitions get the moment.
    try {
      const key = `sticks.win.${matchId}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // private mode: fall through and fire anyway
    }
    fired.current.add(matchId);

    const colors = ["#34d399", "#60a5fa", "#fbbf24", "#fb923c", "#22d3ee", "#f472b6"];
    // Three bursts for shape, all at the top edge.
    confetti({
      particleCount: 80,
      angle: 60,
      spread: 70,
      origin: { x: 0.1, y: 0.2 },
      colors,
      scalar: 0.9,
    });
    confetti({
      particleCount: 80,
      angle: 120,
      spread: 70,
      origin: { x: 0.9, y: 0.2 },
      colors,
      scalar: 0.9,
    });
    confetti({
      particleCount: 60,
      angle: 90,
      spread: 100,
      origin: { y: 0.1 },
      colors,
      scalar: 1.1,
    });
  }, [matchId, status]);

  return null;
}
