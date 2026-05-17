"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Polls a tiny "version" endpoint and calls router.refresh() when the
// version string changes. Adaptive interval: ramps to a fast interval
// right after a detected change, decays back to a slow one after 30s of
// stability, with ±20% jitter so a bunch of clients don't fire on the
// same tick.
//
// TODO realtime: replace this with SSE / websockets backed by a
// pub-sub (Upstash Redis or Supabase Realtime) once we want sub-second
// updates at scale. Until then this delivers ~1s perceived latency
// during active rounds and idles down to 5s when nothing's happening.
//
// Notes:
// - Tab in background -> pause polling (visibilitychange).
// - On each network success we briefly flash a 'just updated' indicator
//   the parent can render (subscribe via window event 'sticks:live-tick').
export default function AutoRefresh({
  endpoint,
  // Lifted from the constants so the caller can override for very
  // bursty pages (e.g. on-course live mode) without forking the file.
  activeIntervalMs = 1200,
  idleIntervalMs = 5000,
  // After a change is detected, stay in "active" mode this long before
  // decaying back to idle.
  activeWindowMs = 30_000,
}: {
  endpoint: string;
  activeIntervalMs?: number;
  idleIntervalMs?: number;
  activeWindowMs?: number;
}) {
  const router = useRouter();
  const lastVersion = useRef<string | null>(null);
  const lastChangeAt = useRef<number>(0);
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
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const computeInterval = () => {
      const age = Date.now() - lastChangeAt.current;
      const base =
        lastChangeAt.current > 0 && age < activeWindowMs
          ? activeIntervalMs
          : idleIntervalMs;
      // ±20% jitter so synchronized clients spread out on the server.
      const jitter = (Math.random() - 0.5) * 0.4 * base;
      return Math.max(400, Math.round(base + jitter));
    };

    const tick = async () => {
      if (cancelled) return;
      // Re-schedule before await so we never miss a tick on slow responses.
      if (visible.current) {
        try {
          const res = await fetch(endpoint, { cache: "no-store" });
          if (res.ok) {
            const { version } = (await res.json()) as { version: string };
            if (!cancelled) {
              if (
                lastVersion.current !== null &&
                version !== lastVersion.current
              ) {
                lastChangeAt.current = Date.now();
                router.refresh();
                window.dispatchEvent(new CustomEvent("sticks:live-tick"));
              }
              lastVersion.current = version;
            }
          }
        } catch {
          // network blip - try again next tick
        }
      }
      if (!cancelled) {
        timerId = setTimeout(tick, computeInterval());
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [endpoint, activeIntervalMs, idleIntervalMs, activeWindowMs, router]);

  return null;
}

// Small component that flashes when the live polling detects a change.
// Use this near any 'Live' indicator to give users feedback that the
// page is fresh.
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
