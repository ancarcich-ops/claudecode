"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTooltip from "./ChartTooltip";

type Row = { hole: number } & Record<string, number>;
type PlayerMeta = { id: string; displayName: string; color: string };

export default function SideGameChart({
  rows,
  players,
  yLabel,
  valueFormatter,
  yDomain,
}: {
  rows: Row[];
  players: PlayerMeta[];
  yLabel: string; // e.g. "points", "skins", "vs par"
  valueFormatter?: (n: number) => string;
  yDomain?: [number | "auto", number | "auto"];
}) {
  if (rows.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-mute border border-dashed border-border rounded-md">
        Chart fills in as scores are logged.
      </div>
    );
  }

  const last = rows[rows.length - 1];
  const lastIdx = rows.length - 1;
  const fmt = valueFormatter ?? ((n) => String(n));

  const endpointDot =
    (color: string) =>
    (props: { cx?: number; cy?: number; index?: number }) => {
      if (props.index !== lastIdx || props.cx == null || props.cy == null) {
        return <g />;
      }
      return (
        <g>
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
          <circle cx={props.cx} cy={props.cy} r={5} fill={color} opacity={0.5} />
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
          data={rows}
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
        >
          <defs>
            {players.map((p) => (
              <linearGradient
                key={p.id}
                id={`sgfill-${p.id}`}
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
            dataKey="hole"
            type="number"
            domain={[1, "dataMax"]}
            ticks={
              rows.length <= 9
                ? rows.map((r) => r.hole)
                : [1, Math.ceil(rows.length / 2), last.hole]
            }
            tickFormatter={(v) => `${v}`}
            tick={{ fontSize: 11, fill: "#8aa094" }}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={yDomain ?? ["auto", "auto"]}
            tick={{ fontSize: 11, fill: "#8aa094" }}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ stroke: "#1f2a25", strokeWidth: 1 }}
            content={(props: {
              active?: boolean;
              payload?: { dataKey?: string | number; value?: unknown; color?: string }[];
              label?: string | number;
            }) => (
              <ChartTooltip
                active={props.active}
                payload={
                  props.payload?.map((it) => ({
                    dataKey: it.dataKey,
                    value: typeof it.value === "number" ? it.value : undefined,
                    color: it.color,
                  }))
                }
                label={props.label}
                labelFormatter={(v) => `Hole ${v}`}
                valueFormatter={(value, key) => {
                  const p = players.find((pl) => pl.id === key);
                  return [fmt(value), p?.displayName ?? key];
                }}
              />
            )}
          />
          {players.map((p) => (
            <Area
              key={`a-${p.id}`}
              type="monotone"
              dataKey={p.id}
              stroke="none"
              fill={`url(#sgfill-${p.id})`}
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
      <div className="text-[10px] text-mute uppercase tracking-wider mt-1 ml-1">
        Hole · {yLabel}
      </div>
    </div>
  );
}
