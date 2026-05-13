"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Polls a tiny "version" endpoint and calls router.refresh() when the version
// string changes. Cheaper than refreshing on a timer, and keeps everything
// server-rendered (chart, odds, scores all update).
export default function AutoRefresh({
  endpoint,
  intervalMs = 4000,
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
