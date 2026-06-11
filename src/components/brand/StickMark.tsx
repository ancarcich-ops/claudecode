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
//   headSize       62%
//   shaftThickness 10u -> 3.0 in the 64-grid
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
  // iron (left, shortest)
  "M 18.5 14.60 Q 18.5 14.00 17.90 14.00 L 16.10 14.00 Q 15.5 14.00 15.5 14.60 L 15.5 47.09 C 15.5 49.09, 11.51 47.39, 7.02 49.83 C 7.02 52.59, 7.52 54.00, 9.22 54.00 C 13.51 54.10, 17.30 53.80, 18.5 51.11 C 18.5 49.19, 18.5 48.09, 18.5 46.79 L 18.5 14.60 Z",
  // driver (center, tallest)
  "M 33.5 6.60 Q 33.5 6.00 32.90 6.00 L 31.10 6.00 Q 30.5 6.00 30.5 6.60 L 30.5 48.14 C 30.5 50.14, 25.62 48.44, 20.40 51.22 C 20.40 54.38, 20.90 56.00, 22.60 56.00 C 27.94 56.10, 32.30 55.80, 33.5 52.69 C 33.5 50.48, 33.5 49.14, 33.5 47.84 L 33.5 6.60 Z",
  // wedge (right, mid)
  "M 48.5 22.60 Q 48.5 22.00 47.90 22.00 L 46.10 22.00 Q 45.5 22.00 45.5 22.60 L 45.5 43.45 C 45.5 45.45, 42.23 43.75, 38.33 46.07 C 38.33 48.67, 38.83 50.00, 40.53 50.00 C 43.97 50.10, 47.30 49.80, 48.5 47.28 C 48.5 45.46, 48.5 44.45, 48.5 43.15 L 48.5 22.60 Z",
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
    </svg>
  );
}

export default StickMark;
