"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
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

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#1f2a25" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              new Date(v).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })
            }
            tick={{ fontSize: 11 }}
            stroke="#1f2a25"
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11 }}
            stroke="#1f2a25"
            width={42}
          />
          <Tooltip
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(value: number, key: string) => {
              const p = players.find((pl) => pl.id === key);
              return [
                `${(value * 100).toFixed(1)}%`,
                p?.displayName ?? key,
              ];
            }}
          />
          {players.map((p) => (
            <Line
              key={p.id}
              type="monotone"
              dataKey={p.id}
              stroke={p.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
