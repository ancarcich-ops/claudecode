"use client";

// Recharts emits one tooltip entry per series (Area + Line + ReferenceLine, etc).
// We render an Area and a Line per player both keyed on the player id, which
// makes each player appear twice. Dedupe by dataKey before rendering.
//
// Props are loose-typed to avoid Recharts' generic TooltipProps<ValueType,
// NameType> clashing when spread from the chart's `content` callback.
type Payload = {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
};

export default function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Payload[];
  label?: string | number;
  labelFormatter: (v: unknown) => string;
  valueFormatter: (val: number, key: string) => [string, string];
}) {
  if (!active || !payload || payload.length === 0) return null;

  // Keep the *last* entry per dataKey so we get the Line's stroke color
  // instead of the Area's gradient-URL fill. Areas render first and are
  // earlier in the payload; Lines render on top and have the real color.
  const byKey = new Map<string, Payload>();
  for (const p of payload) {
    if (p.value == null) continue;
    byKey.set(String(p.dataKey), p);
  }
  const unique = Array.from(byKey.values());
  if (unique.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "rgb(var(--color-panel))",
        border: "1px solid rgb(var(--color-border))",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        minWidth: 140,
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ color: "rgb(var(--color-mute))", marginBottom: 4 }}>
        {labelFormatter(label)}
      </div>
      {unique.map((item) => {
        const [val, name] = valueFormatter(
          item.value as number,
          String(item.dataKey),
        );
        return (
          <div
            key={String(item.dataKey)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              lineHeight: "18px",
            }}
          >
            <span style={{ color: item.color ?? "rgb(var(--color-ink))" }}>
              {name}
            </span>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
                color: "rgb(var(--color-ink))",
              }}
            >
              {val}
            </span>
          </div>
        );
      })}
    </div>
  );
}
