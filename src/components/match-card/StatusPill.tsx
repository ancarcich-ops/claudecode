// Status pill at the top right of every match card. Three flavors:
//   - LIVE      : pulsing emerald dot + "LIVE"
//   - UPCOMING  : sky-tinted countdown ("In 2h 14m")
//   - SETTLED   : gold "FINAL"
//
// Used by MatchCard via the `status` prop. Countdown updates every 60s.

"use client";

import { useEffect, useState } from "react";

export default function StatusPill({
  status,
  scheduledAt,
}: {
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  scheduledAt: Date;
}) {
  if (status === "IN_PROGRESS") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5">
        <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
          Live
        </span>
      </span>
    );
  }
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-gold">
          Final
        </span>
      </span>
    );
  }
  return <Countdown scheduledAt={scheduledAt} />;
}

function Countdown({ scheduledAt }: { scheduledAt: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const target = scheduledAt.getTime();
  const diffMs = target - now;
  const label = formatCountdown(diffMs);

  return (
    <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-sky-400">
        {label}
      </span>
    </span>
  );
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return "Now";
  const totalMinutes = Math.round(diffMs / 60_000);
  if (totalMinutes < 60) return `In ${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) return mins === 0 ? `In ${hours}h` : `In ${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH === 0 ? `In ${days}d` : `In ${days}d ${remH}h`;
}
