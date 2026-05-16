"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = {
  t: number;
  vsPar: number;
  holesPlayed: number;
  courseName: string;
};

// Round-by-round score-to-par history as bars. Each bar is one round.
// Y-axis is reversed so par (0) sits near the top and over-par bars hang
// downward -- visually "lower = bigger score = worse". Under-par bars
// would extend upward past the par line. Lower = better.
export default function RoundHistoryChart({ rounds }: { rounds: Row[] }) {
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

  // Y-axis domain. We keep 0 (par) inside the visible range no matter
  // what, then snap to integers and pad outward by 1 so bars don't kiss
  // the top/bottom and ticks are always whole numbers.
  const values = rounds.map((r) => r.vsPar);
  const rawLo = Math.min(0, ...values);
  const rawHi = Math.max(0, ...values);
  const lo = Math.floor(rawLo) - 1;
  const hi = Math.ceil(rawHi) + 1;

  const colorFor = (v: number) =>
    v < 0 ? "#34d399" : v === 0 ? "#fbbf24" : "#f87171";

  // Decimate x-axis labels so we don't crowd. Show first, last, and a few
  // in between (every ~25% of the way).
  const tickIndices = (() => {
    if (rounds.length <= 4) return rounds.map((_, i) => i);
    const step = Math.max(1, Math.floor((rounds.length - 1) / 3));
    const idx = new Set<number>();
    for (let i = 0; i < rounds.length; i += step) idx.add(i);
    idx.add(rounds.length - 1);
    return Array.from(idx).sort((a, b) => a - b);
  })();

  // Use the row index as the x key so bars sit at evenly spaced slots
  // even when rounds aren't evenly spaced in time.
  const data = rounds.map((r, i) => ({ ...r, i }));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-mute">
          {rounds.length} round{rounds.length === 1 ? "" : "s"}
        </div>
        <div className="text-[11px] font-mono tabular-nums text-mute">
          recent avg{" "}
          <span className={recent <= 0 ? "text-accent" : "text-ink"}>
            {recent > 0 ? "+" : ""}
            {recent.toFixed(1)}
          </span>
        </div>
      </div>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
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
                payload?: { payload?: Row }[];
              }) => {
                if (!active || !payload || payload.length === 0) return null;
                const r = payload[0].payload;
                if (!r) return null;
                const v = r.vsPar;
                const color =
                  v < 0 ? "text-accent" : v === 0 ? "text-gold" : "text-danger";
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
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-mute mt-2 text-center">
        <span className="text-accent">Under par</span>
        <span className="opacity-50"> · </span>
        <span className="text-gold">par</span>
        <span className="opacity-50"> · </span>
        <span className="text-danger">over par</span>
      </p>
    </div>
  );
}
