import * as React from "react";

// Sticks "The Three" brandmark -- three golf-club silhouettes
// (left-facing heads, heads at the top) in brand emerald. Reads as
// clubs-in-a-bag / candlestick chart / three stacked games.
//
// Locked configuration (do not hand-edit the paths -- regenerate via
// the design kit's generateMark.ts if a config tweak is ever needed):
//   markStyle      'clubs'
//   headEnd        'top'      heads sit at the TOP of each shaft
//   headFace       'left'     heads curve to the LEFT
//   headSize       100%
//   shaftThickness 18u -> 5.13 in the 64-grid
//   offsetX        +4.5       optical-center nudge to the right
//                              (left-facing heads otherwise crowd
//                              the left edge)
//   color          #34d399    brand emerald

export interface StickMarkProps extends React.SVGProps<SVGSVGElement> {
  // Rendered width and height in px. Default 26 (the in-app header size).
  size?: number;
  // Override the mark color. Default brand emerald. Pass "currentColor"
  // to inherit text color (useful with text-accent / theme tokens).
  color?: string;
  // Accessible label. Pass null for a decorative mark (aria-hidden).
  title?: string | null;
}

// Three baked path strings -- one per club.
const PATHS = [
  // iron (left)
  "M 19.57 14.60 Q 19.57 14.00 18.97 14.00 L 15.03 14.00 Q 14.43 14.00 14.43 14.60 L 14.43 46.10 C 14.43 48.10, 10.68 46.40, 5.50 49.19 C 5.50 52.37, 6.00 54.00, 7.70 54.00 C 12.98 54.10, 17.30 53.80, 19.57 50.67 C 19.57 48.45, 19.57 47.10, 19.57 45.80 L 19.57 14.60 Z",
  // driver (center, tallest)
  "M 34.57 6.60 Q 34.57 6.00 33.97 6.00 L 30.03 6.00 Q 29.43 6.00 29.43 6.60 L 29.43 47.00 C 29.43 49.00, 24.57 47.30, 18.50 50.48 C 18.50 54.13, 19.00 56.00, 20.70 56.00 C 27.27 56.10, 32.30 55.80, 34.57 52.17 C 34.57 49.63, 34.57 48.00, 34.57 46.70 L 34.57 6.60 Z",
  // wedge (right, shortest)
  "M 49.57 22.60 Q 49.57 22.00 48.97 22.00 L 45.03 22.00 Q 44.43 22.00 44.43 22.60 L 44.43 42.50 C 44.43 44.50, 41.50 42.80, 37.00 45.45 C 37.00 48.46, 37.50 50.00, 39.20 50.00 C 43.50 50.10, 47.30 49.80, 49.57 46.85 C 49.57 44.75, 49.57 43.50, 49.57 42.20 L 49.57 22.60 Z",
];

// Each shaft is vertically reflected so the head sits at the TOP.
// reflectY = 2 * midY of that club's shaft span in the 64-unit grid.
const REFLECT_Y = [68, 62, 72];

export function StickMark({
  size = 26,
  color = "#34d399",
  title = "Sticks",
  ...rest
}: StickMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {/* +4.5 X nudge: left-facing heads otherwise crowd the left edge */}
      <g transform="translate(4.5 0)">
        {PATHS.map((d, i) => (
          <g key={i} transform={`translate(0 ${REFLECT_Y[i]}) scale(1 -1)`}>
            <path
              d={d}
              fill={color}
              stroke={color}
              strokeWidth={0.4}
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default StickMark;
