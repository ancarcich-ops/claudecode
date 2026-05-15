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

type Row = { t: number } & Record<string, number>;
type PlayerMeta = { id: string; displayName: string; color: string };

export default function OddsChart({
  series,
  players,
}: {
  series: Row[];
  players: PlayerMeta[];
}) {
  if (series.length < 2) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-mute border border-dashed border-border rounded-md">
        Odds chart appears once the market has movement.
      </div>
    );
  }

  const last = series[series.length - 1];
  const lastIdx = series.length - 1;

  // Custom dot renderer for Line: only emit a circle at the final point so we
  // get an emphasized "live" marker without dots peppering the whole line.
  const endpointDot =
    (color: string) =>
    (props: { cx?: number; cy?: number; index?: number }) => {
      if (props.index !== lastIdx || props.cx == null || props.cy == null) {
        return <g />;
      }
      return (
        <g>
          {/* Soft halo that breathes -- SMIL animation works inside the
             SVG Recharts renders and doesn't depend on chart re-renders. */}
          <circle cx={props.cx} cy={props.cy} fill={color}>
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
          {/* Outer ring */}
          <circle cx={props.cx} cy={props.cy} r={5} fill={color} opacity={0.5} />
          {/* Crisp inner dot with a dark stroke so it pops on its own line */}
          <circle
            cx={props.cx}
            cy={props.cy}
            r={3}
            fill={color}
            stroke="#0b0f0c"
            strokeWidth={1.5}
          />
        </g>
      );
    };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={series}
          margin={{ top: 8, right: 16, bottom: 4, left: -12 }}
        >
          <defs>
            {players.map((p) => (
              <linearGradient
                key={p.id}
                id={`oddsfill-${p.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={p.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={p.color} stopOpacity={0} />
              </linearGradient>
            ))}
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
            ticks={[series[0].t, last.t]}
            tickFormatter={(_v, i) => (i === 0 ? "Open" : "Now")}
            tick={{ fontSize: 11, fill: "#8aa094" }}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0.25, 0.5, 0.75]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: "#8aa094" }}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <ReferenceLine
            y={0.5}
            stroke="#1f2a25"
            strokeDasharray="3 5"
            ifOverflow="extendDomain"
          />
          <Tooltip
            labelFormatter={(v) =>
              new Date(Number(v)).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })
            }
            formatter={(value: number, key: string) => {
              const p = players.find((pl) => pl.id === key);
              return [
                `${(value * 100).toFixed(0)}%`,
                p?.displayName ?? key,
              ];
            }}
            contentStyle={{
              backgroundColor: "#161f1b",
              border: "1px solid #1f2a25",
              borderRadius: 8,
              fontSize: 12,
              padding: "8px 10px",
            }}
            cursor={{ stroke: "#1f2a25", strokeWidth: 1 }}
          />
          {players.map((p) => (
            <Area
              key={`a-${p.id}`}
              type="monotone"
              dataKey={p.id}
              stroke="none"
              fill={`url(#oddsfill-${p.id})`}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
              activeDot={false}
            />
          ))}
          {players.map((p) => (
            <Line
              key={`l-${p.id}`}
              type="monotone"
              dataKey={p.id}
              stroke={p.color}
              strokeWidth={2.25}
              dot={endpointDot(p.color)}
              activeDot={{
                r: 4,
                stroke: "#0b0f0c",
                strokeWidth: 2,
                fill: p.color,
              }}
              isAnimationActive
              animationDuration={1100}
              animationEasing="ease-out"
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
