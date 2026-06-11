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
//   headSize       58%
//   shaftThickness 14.5u -> 4.2 in the 64-grid
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
  "M 19.1 14.60 Q 19.1 14.00 18.50 14.00 L 15.50 14.00 Q 14.9 14.00 14.9 14.60 L 14.9 47.19 C 14.9 49.19, 11.60 47.49, 7.18 49.90 C 7.18 52.61, 7.68 54.00, 9.38 54.00 C 13.56 54.10, 17.30 53.80, 19.1 51.16 C 19.1 49.27, 19.1 48.19, 19.1 46.89 L 19.1 14.60 Z",
  // driver (center, tallest)
  "M 34.1 6.60 Q 34.1 6.00 33.50 6.00 L 30.50 6.00 Q 29.9 6.00 29.9 6.60 L 29.9 48.26 C 29.9 50.26, 25.73 48.56, 20.60 51.29 C 20.60 54.41, 21.10 56.00, 22.80 56.00 C 28.01 56.10, 32.30 55.80, 34.1 52.74 C 34.1 50.57, 34.1 49.26, 34.1 47.96 L 34.1 6.60 Z",
  // wedge (right, shortest)
  "M 49.1 22.60 Q 49.1 22.00 48.50 22.00 L 45.50 22.00 Q 44.9 22.00 44.9 22.60 L 44.9 43.55 C 44.9 45.55, 42.31 43.85, 38.47 46.13 C 38.47 48.69, 38.97 50.00, 40.67 50.00 C 44.01 50.10, 47.30 49.80, 49.1 47.32 C 49.1 45.54, 49.1 44.55, 49.1 43.25 L 49.1 22.60 Z",
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
