"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import BaselinePicker from "./BaselinePicker";

type Row = {
  t: number;
  vsPar: number;
  holesPlayed: number;
  courseName: string;
};

// Round-by-round score-to-par history as bars. Y-axis is reversed so par
// sits near the top and over-par bars hang downward. Bars are green for
// over-par (the normal case) and gold for the rare under-par round, so
// the bar-color story is "your golf, more vivid when it's exceptional".
// An overlaid dotted line shows what the chosen HI baseline player would
// have shot on each round (scaled to the round's hole count).
export default function RoundHistoryChart({
  rounds,
  baselineHcp,
}: {
  rounds: Row[];
  baselineHcp: number;
}) {
  if (rounds.length < 1) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-mute border border-dashed border-border rounded-md">
        Log a round and this chart fills in.
      </div>
    );
  }

  const recentN = Math.min(5, rounds.length);
  const recent =
    rounds.slice(-recentN).reduce((s, r) => s + r.vsPar, 0) / recentN;

  // Per-round HI baseline = (hcp / 18) * holesPlayed. A 12-HI on an 18
  // would expect +12; on a 9-hole round, +6. Close enough for the
  // visual; the real WHS math factors in slope/CR which we don't have.
  const data = rounds.map((r, i) => ({
    ...r,
    i,
    baseline: (baselineHcp / 18) * r.holesPlayed,
  }));

  // Y-axis domain. Always include 0 (par) and the baseline line, snap to
  // integers, pad by 1 either side so bars + line don't touch the edges.
  const values = data.flatMap((r) => [r.vsPar, r.baseline]);
  const rawLo = Math.min(0, ...values);
  const rawHi = Math.max(0, ...values);
  const lo = Math.floor(rawLo) - 1;
  const hi = Math.ceil(rawHi) + 1;

  // Bars colored to the user's preferred convention:
  //   over par  -> green (the everyday case stays visible but on-brand)
  //   under par -> gold  (rare and celebratory)
  //   par       -> 0-height, no fill needed
  const colorFor = (v: number) => (v < 0 ? "#fbbf24" : "#34d399");

  // Decimate x-axis labels so we don't crowd. Show first, last, and a
  // couple in between.
  const tickIndices = (() => {
    if (rounds.length <= 4) return rounds.map((_, i) => i);
    const step = Math.max(1, Math.floor((rounds.length - 1) / 3));
    const idx = new Set<number>();
    for (let i = 0; i < rounds.length; i += step) idx.add(i);
    idx.add(rounds.length - 1);
    return Array.from(idx).sort((a, b) => a - b);
  })();

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-wider text-mute">
          {rounds.length} round{rounds.length === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-3">
          <BaselinePicker selected={baselineHcp} id="rounds-vs" />
          <div className="text-[11px] font-mono tabular-nums text-mute">
            recent avg{" "}
            <span className={recent <= 0 ? "text-accent" : "text-ink"}>
              {recent > 0 ? "+" : ""}
              {recent.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 16, right: 16, bottom: 20, left: 4 }}
          >
            <CartesianGrid
              stroke="rgb(var(--color-border))"
              vertical={false}
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="i"
              type="number"
              domain={[-0.5, rounds.length - 0.5]}
              ticks={tickIndices}
              tickFormatter={(v) => {
                const r = rounds[v];
                if (!r) return "";
                return new Date(r.t).toLocaleDateString(undefined, {
                  month: "numeric",
                  day: "numeric",
                });
              }}
              tick={{ fontSize: 11, fill: "rgb(var(--color-mute))" }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[lo, hi]}
              reversed
              allowDecimals={false}
              tickFormatter={(v) =>
                v === 0 ? "Par" : v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`
              }
              tick={{ fontSize: 11, fill: "rgb(var(--color-mute))" }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <ReferenceLine
              y={0}
              stroke="rgb(var(--color-accent))"
              strokeOpacity={0.45}
              strokeDasharray="3 5"
            />
            <Tooltip
              cursor={{ fill: "rgb(var(--color-panel2) / 0.5)" }}
              content={({
                active,
                payload,
              }: {
                active?: boolean;
                payload?: { payload?: Row & { baseline?: number } }[];
              }) => {
                if (!active || !payload || payload.length === 0) return null;
                const r = payload[0].payload;
                if (!r) return null;
                const v = r.vsPar;
                const color =
                  v < 0 ? "text-gold" : v === 0 ? "text-mute" : "text-accent";
                const base = r.baseline;
                const delta = base != null ? v - base : null;
                const deltaColor =
                  delta == null
                    ? "text-mute"
                    : delta < 0
                      ? "text-gold"
                      : "text-accent";
                return (
                  <div className="rounded-md border border-border bg-panel/95 backdrop-blur px-2.5 py-1.5 shadow-md text-xs">
                    <div className="text-mute text-[10px] uppercase tracking-wider">
                      {new Date(r.t).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div className="text-ink truncate max-w-[14rem]">
                      {r.courseName}
                    </div>
                    <div className="font-mono tabular-nums mt-0.5">
                      <span className={color}>
                        {v > 0 ? "+" : ""}
                        {v === 0 ? "E" : v}
                      </span>
                      <span className="text-mute">
                        {" "}
                        · {r.holesPlayed} hole{r.holesPlayed === 1 ? "" : "s"}
                      </span>
                    </div>
                    {base != null && (
                      <div className="text-[10px] text-mute font-mono tabular-nums mt-0.5">
                        {baselineHcp} HI expects {base >= 0 ? "+" : ""}
                        {base.toFixed(1)}
                        {delta != null && (
                          <>
                            {" · "}
                            <span className={deltaColor}>
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(1)} vs them
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="vsPar"
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
              radius={[3, 3, 3, 3]}
              maxBarSize={36}
            >
              {data.map((r) => (
                <Cell key={r.i} fill={colorFor(r.vsPar)} />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="rgb(var(--color-ink))"
              strokeOpacity={0.55}
              strokeDasharray="2 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              activeDot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-mute mt-2 text-center">
        <span className="text-accent">Over par</span>
        <span className="opacity-50"> · </span>
        <span className="text-gold">under par</span>
        <span className="opacity-50"> · </span>
        <span className="text-ink/70">
          dotted line = {baselineHcp} HI baseline
        </span>
      </p>
    </div>
  );
}

