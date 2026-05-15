"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Polls a tiny "version" endpoint and calls router.refresh() when the version
// string changes. Cheaper than refreshing on a timer, and keeps everything
// server-rendered (chart, odds, scores all update).
//
// Notes:
// - Tab in background -> pause polling (visibilitychange).
// - On each network success we briefly flash a 'just updated' indicator
//   the parent can render (subscribe via window event 'sticks:live-tick').
export default function AutoRefresh({
  endpoint,
  intervalMs = 2500,
}: {
  endpoint: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const lastVersion = useRef<string | null>(null);
  const visible = useRef(true);

  useEffect(() => {
    const onVisibility = () => {
      visible.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!visible.current) return;
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version: string };
        if (cancelled) return;
        if (lastVersion.current !== null && version !== lastVersion.current) {
          router.refresh();
          // Tell any subscriber (e.g. a 'just updated' pulse) the version
          // moved. Lightweight cross-component signal without a context.
          window.dispatchEvent(new CustomEvent("sticks:live-tick"));
        }
        lastVersion.current = version;
      } catch {
        // network blip - try again next tick
      }
    };
    // Prime the version without refreshing on first load.
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [endpoint, intervalMs, router]);

  return null;
}

// Small component that flashes when the live polling detects a change.
// Use this near any 'Live' indicator to give users feedback that the page
// is fresh.
export function LiveTickFlash({ className }: { className?: string }) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const onTick = () => {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    };
    window.addEventListener("sticks:live-tick", onTick);
    return () => window.removeEventListener("sticks:live-tick", onTick);
  }, []);
  return (
    <span
      aria-hidden
      className={
        "inline-block w-1.5 h-1.5 rounded-full transition-all " +
        (flash ? "bg-accent shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" : "bg-accent/40") +
        " " +
        (className ?? "")
      }
    />
  );
}
