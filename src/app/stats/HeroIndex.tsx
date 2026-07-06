// Stats hero index block ("Stats Redesign" handoff): a two-panel card.
// Left: the forest Sticks Index panel with a 30-day trend pill, an
// index-trajectory sparkline, and a rounds-completed caption. Right:
// two icon-tile stat cells (Avg score, Best + course chip). Tokens map
// to the theme vars so the hero recolors with the active skin.

const CHIP_CLS =
  "font-mono text-[10px] tracking-[0.16em] uppercase";

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 26;
  const pad = 3;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    // Lower index = better = lower on the chart reads wrong for a
    // "trajectory" — plot the raw value so downward slope = improving.
    const y = pad + ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-[26px] mt-[11px] opacity-90"
      aria-hidden
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="rgb(var(--ink-on-accent))"
        strokeOpacity="0.85"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="2.6"
        fill="rgb(var(--ink-on-accent))"
      />
    </svg>
  );
}

export default function HeroIndex({
  index,
  pendingRounds,
  delta30,
  trajectory,
  roundsCompleted,
  ghin,
  avg18,
  bestVsPar,
  bestCourse,
}: {
  index: number | null;
  // Rounds logged so far toward the 3 needed (only used when index is null).
  pendingRounds: number;
  delta30: number | null;
  trajectory: number[];
  roundsCompleted: number;
  ghin: string | null;
  avg18: number | null;
  bestVsPar: number | null;
  bestCourse: string | null;
}) {
  const formatIndex = (n: number) =>
    n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
  const formatVsPar = (n: number) =>
    n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;

  return (
    <section className="mt-[18px] rounded-[16px] border border-border bg-panel overflow-hidden flex flex-col sm:flex-row">
      {/* Left: the forest index panel */}
      <div className="relative overflow-hidden bg-accent sm:flex-[1.15] px-[18px] pt-4 pb-[14px]">
        {/* Soft radial glow, bottom-right */}
        <span
          aria-hidden
          className="pointer-events-none absolute w-[120px] h-[120px] -right-[30px] -bottom-[30px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,.10), transparent 70%)",
          }}
        />
        <div
          className={CHIP_CLS}
          style={{ color: "rgb(var(--ink-on-accent) / 0.72)" }}
        >
          Sticks Index
        </div>
        {index != null ? (
          <div
            className="font-display font-bold text-[44px] leading-[0.9] mt-1.5 tabular-nums"
            style={{ color: "rgb(var(--ink-on-accent))" }}
          >
            {formatIndex(index)}
          </div>
        ) : (
          <div
            className="font-display italic font-medium text-[28px] leading-[0.9] mt-2"
            style={{ color: "rgb(var(--ink-on-accent) / 0.85)" }}
          >
            pending
          </div>
        )}
        {index != null && delta30 != null && Math.abs(delta30) >= 0.1 && (
          <div
            className="inline-flex items-center gap-1 self-start mt-[9px] rounded-[20px] py-[3px] pl-1.5 pr-2 font-mono text-[10.5px]"
            style={{
              background: "rgb(var(--ink-on-accent) / 0.14)",
              color: "rgb(var(--ink-on-accent))",
            }}
            title="Index change over the last 30 days"
          >
            <svg
              aria-hidden
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={delta30 > 0 ? undefined : { transform: "rotate(180deg)" }}
            >
              <path d="M5.5 9V2M2.5 5L5.5 2l3 3" />
            </svg>
            {Math.abs(delta30).toFixed(1)} last 30 days
          </div>
        )}
        {index != null ? (
          <Sparkline values={trajectory} />
        ) : (
          <div
            className="font-mono text-[10px] mt-[11px]"
            style={{ color: "rgb(var(--ink-on-accent) / 0.6)" }}
          >
            {pendingRounds}/3 rounds logged
          </div>
        )}
        <div
          className="font-mono text-[10px] mt-[9px]"
          style={{ color: "rgb(var(--ink-on-accent) / 0.6)" }}
        >
          {roundsCompleted} round{roundsCompleted === 1 ? "" : "s"} completed
          {ghin ? ` · GHIN #${ghin}` : ""}
        </div>
      </div>

      {/* Right: two icon-tile stat cells */}
      <div className="sm:flex-1 flex flex-col">
        <div className="flex-1 flex items-center gap-3 px-[15px] py-[13px]">
          <span className="w-[34px] h-[34px] rounded-[10px] grid place-items-center bg-accent/10 text-accent shrink-0">
            <svg
              aria-hidden
              width="17"
              height="17"
              viewBox="0 0 17 17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M3 14.5v-5M8.5 14.5v-10M14 14.5v-7" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className={`${CHIP_CLS} text-[9px] text-faint`}>
              Avg score
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-[27px] leading-tight text-ink tabular-nums">
                {avg18 != null ? Math.round(avg18) : "—"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-3 px-[15px] py-[13px] border-t border-borderSoft">
          <span className="w-[34px] h-[34px] rounded-[10px] grid place-items-center bg-gold/[0.14] text-gold shrink-0">
            <svg
              aria-hidden
              width="17"
              height="17"
              viewBox="0 0 17 17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 2.5h7v3a3.5 3.5 0 0 1-7 0v-3Z" />
              <path d="M5 3.5H3a2.5 2.5 0 0 0 2.4 3M12 3.5h2a2.5 2.5 0 0 1-2.4 3M8.5 9v2.5M5.5 14.5h6M6.5 11.5h4v3h-4z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className={`${CHIP_CLS} text-[9px] text-faint`}>Best</div>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={
                  "font-display font-bold text-[27px] leading-tight tabular-nums " +
                  (bestVsPar != null && bestVsPar < 0
                    ? "text-accent"
                    : bestVsPar === 0
                      ? "text-gold"
                      : "text-ink")
                }
              >
                {bestVsPar != null ? formatVsPar(bestVsPar) : "—"}
              </span>
              {bestCourse && (
                <span className="font-mono text-[10px] text-gold truncate">
                  {bestCourse}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
