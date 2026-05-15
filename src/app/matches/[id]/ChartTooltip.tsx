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

  const seen = new Set<string>();
  const unique = payload.filter((p) => {
    const k = String(p.dataKey);
    if (seen.has(k) || p.value == null) return false;
    seen.add(k);
    return true;
  });
  if (unique.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "#161f1b",
        border: "1px solid #1f2a25",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        minWidth: 140,
      }}
    >
      <div style={{ color: "#8aa094", marginBottom: 4 }}>
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
            <span style={{ color: item.color ?? "#e8f0ea" }}>{name}</span>
            <span style={{ fontFamily: "ui-monospace, monospace" }}>
              {val}
            </span>
          </div>
        );
      })}
    </div>
  );
}
