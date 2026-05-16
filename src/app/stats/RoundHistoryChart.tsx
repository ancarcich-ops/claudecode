"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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

// Round-by-round score-to-par history. Vs-par normalizes for any hole count
// (9, 12, 18) so every round sits on the same axis. Lower = better.
export default function RoundHistoryChart({ rounds }: { rounds: Row[] }) {
  if (rounds.length < 2) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-mute border border-dashed border-border rounded-md">
        Two completed rounds and this chart fills in.
      </div>
    );
  }

  // Y-axis domain padded so the line breathes -- include the par line (0)
  // in every case so the comparison is honest.
  const values = rounds.map((r) => r.vsPar);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = Math.max(1, (hi - lo) * 0.15);
  const lastIdx = rounds.length - 1;

  // Trend: average of the most recent 5 rounds vs the earliest 5. Drawn as
  // a small badge above the chart so the user can read direction at a glance.
  const recentN = Math.min(5, rounds.length);
  const recent =
    rounds.slice(-recentN).reduce((s, r) => s + r.vsPar, 0) / recentN;

  const endpointDot = (props: { cx?: number; cy?: number; index?: number }) => {
    if (props.index !== lastIdx || props.cx == null || props.cy == null)
      return <g />;
    return (
      <g>
        <circle cx={props.cx} cy={props.cy} fill="#34d399">
          <animate
            attributeName="r"
            values="8;13;8"
            dur="2.2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.18;0.05;0.18"
            dur="2.2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx={props.cx} cy={props.cy} r={5} fill="#34d399" opacity={0.5} />
        <circle
          cx={props.cx}
          cy={props.cy}
          r={3}
          fill="#34d399"
          stroke="#0b0f0c"
          strokeWidth={1.5}
        />
      </g>
    );
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-mute">
          Last {rounds.length} rounds
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
          <ComposedChart
            data={rounds}
            margin={{ top: 8, right: 16, bottom: 4, left: 4 }}
          >
            <defs>
              <linearGradient id="vsParFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="#1f2a25"
              vertical={false}
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={[rounds[0].t, rounds[lastIdx].t]}
              tickFormatter={(_v, i) => (i === 0 ? "Earliest" : "Latest")}
              tick={{ fontSize: 11, fill: "#8aa094" }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[lo - pad, hi + pad]}
              tickFormatter={(v) =>
                v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`
              }
              tick={{ fontSize: 11, fill: "#8aa094" }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <ReferenceLine
              y={0}
              stroke="#34d399"
              strokeOpacity={0.35}
              strokeDasharray="3 5"
              label={{
                value: "par",
                position: "insideRight",
                fill: "#34d399",
                fontSize: 10,
                opacity: 0.6,
              }}
            />
            <Tooltip
              cursor={{ stroke: "#1f2a25", strokeWidth: 1 }}
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
                  v < 0 ? "text-accent" : v === 0 ? "text-gold" : "text-ink";
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
            <Area
              type="monotone"
              dataKey="vsPar"
              stroke="none"
              fill="url(#vsParFill)"
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="vsPar"
              stroke="#34d399"
              strokeWidth={2.25}
              dot={endpointDot}
              activeDot={{
                r: 4,
                stroke: "#0b0f0c",
                strokeWidth: 2,
                fill: "#34d399",
              }}
              isAnimationActive
              animationDuration={1100}
              animationEasing="ease-out"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
