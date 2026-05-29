"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

export type Slice = { name: string; value: number; color: string };
export type Bar2 = { label: string; count: number };

export function CategoryPie({ data }: { data: Slice[] }) {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={48}
            outerRadius={84}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-mute">
        {data.map((d) => (
          <span key={d.name} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            {d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}

export function TopFoods({ data, accent = "#ec7ba4" }: { data: Bar2[]; accent?: string }) {
  return (
    <div style={{ height: Math.max(120, data.length * 38) }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: "rgb(var(--color-panel2))" }} />
          <Bar dataKey="count" fill={accent} radius={[6, 6, 6, 6]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverTime({ data, accent = "#ec7ba4" }: { data: Bar2[]; accent?: string }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="craveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-borderSoft))" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="count"
            stroke={accent}
            strokeWidth={2.5}
            fill="url(#craveFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrimesterBars({ data, accent = "#ec7ba4" }: { data: Bar2[]; accent?: string }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-borderSoft))" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ fill: "rgb(var(--color-panel2))" }} />
          <Bar dataKey="count" fill={accent} radius={[8, 8, 0, 0]} barSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
