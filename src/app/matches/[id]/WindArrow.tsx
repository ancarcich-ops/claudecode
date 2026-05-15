// Wind compass: arrow points in the direction wind is blowing TO (i.e.
// fromDeg + 180). MPH centered. North is up.
export default function WindArrow({
  fromDeg,
  speedMph,
}: {
  fromDeg: number;
  speedMph: number;
}) {
  // Direction the wind is blowing TO. Open-Meteo reports "from" by
  // convention; the arrow visualizes movement so we flip.
  const toDeg = (fromDeg + 180) % 360;
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-9 h-9 flex items-center justify-center">
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          className="absolute inset-0 text-mute"
          aria-hidden
        >
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.5"
          />
        </svg>
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          style={{ transform: `rotate(${toDeg}deg)` }}
          className="absolute inset-0 text-accent transition-transform"
          aria-label={`Wind ${speedMph} mph from ${Math.round(fromDeg)}°`}
        >
          <path
            d="M18 6 L22 16 L18 13 L14 16 Z"
            fill="currentColor"
          />
          <line
            x1="18"
            y1="13"
            x2="18"
            y2="28"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <div className="font-mono tabular-nums text-base text-ink">
          {speedMph}
          <span className="text-xs text-mute"> mph</span>
        </div>
        <div className="text-[9px] uppercase tracking-wider text-mute">
          Wind
        </div>
      </div>
    </div>
  );
}
