// Tiny 56x16 SVG sparkline showing a player's running net-to-par across
// the holes they've actually scored. Filled area underneath the line in
// the same color at 12% alpha. Gold-tinted for the leader / winner; the
// default accent otherwise.
//
// The y-axis is auto-scaled around 0, and we draw a faint horizontal
// reference at par so it's clear which direction is "good".

const W = 56;
const H = 16;
const PAD_X = 2;
const PAD_Y = 2;

export default function Sparkline({
  values,
  tone = "accent",
}: {
  values: number[];
  tone?: "accent" | "gold";
}) {
  // Need at least 2 points to draw a line. 1 point falls back to a dot.
  if (values.length === 0) return <span className="inline-block w-[56px]" />;
  const stroke =
    tone === "gold" ? "rgb(var(--color-gold))" : "rgb(var(--color-accent))";

  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const range = Math.max(1, hi - lo);
  // For golf, lower (negative) values are good -- we want them HIGHER on
  // screen. Map so negative goes UP.
  const yFor = (v: number) => PAD_Y + ((hi - v) / range) * (H - PAD_Y * 2);
  const xFor = (i: number) =>
    values.length === 1
      ? W / 2
      : PAD_X + (i / (values.length - 1)) * (W - PAD_X * 2);

  if (values.length === 1) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <circle cx={xFor(0)} cy={yFor(values[0])} r={1.5} fill={stroke} />
      </svg>
    );
  }

  const linePoints = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
  // Closed area extends straight down to the bottom edge.
  const areaPoints = [
    `${xFor(0)},${H - PAD_Y}`,
    ...values.map((v, i) => `${xFor(i)},${yFor(v)}`),
    `${xFor(values.length - 1)},${H - PAD_Y}`,
  ].join(" ");

  const parY = yFor(0);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={parY}
        y2={parY}
        stroke="rgb(var(--color-border))"
        strokeDasharray="1 2"
        strokeWidth={0.6}
      />
      <polygon points={areaPoints} fill={stroke} fillOpacity={0.12} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={xFor(values.length - 1)}
        cy={yFor(values[values.length - 1])}
        r={1.4}
        fill={stroke}
      />
    </svg>
  );
}
