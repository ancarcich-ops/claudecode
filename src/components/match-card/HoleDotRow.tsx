// 9 + | + 9 grid of score dots, one per hole. Colors follow the design
// system (intentionally different from the standalone /stats chart so
// green = positive everywhere inside a card). Each played hole also
// renders the raw stroke count inside the square (e.g. 3, 5) so a bogey
// and a double bogey are visually unambiguous and the actual score is
// readable at a glance, not just shades of red:
//
//   under par (birdie) -> solid accent (emerald)
//   eagle              -> solid gold
//   par                -> faint accent fill + border (subtle green so it
//                         reads as quietly positive, not neutral grey)
//   bogey              -> muted danger fill (darker red)
//   double or worse    -> solid danger fill (bright red) + halo ring
//                         so the brighter red and the halo together
//                         make "worse than bogey" obvious
//   current hole       -> dashed accent border, accent 8% fill
//   unplayed           -> 1px border, transparent fill
//
// For 9-hole rounds we collapse to a single row with no separator.

import type { Dot as DotData } from "@/lib/matchCard";

export default function HoleDotRow({
  dots,
  totalHoles,
}: {
  dots: DotData[];
  totalHoles: number;
}) {
  if (totalHoles === 9) {
    return (
      <div className="grid grid-cols-9 gap-1">
        {dots.map((d, i) => (
          <Dot key={i} dot={d} />
        ))}
      </div>
    );
  }
  // 18 holes -> Out | In
  const out = dots.slice(0, 9);
  const back = dots.slice(9, 18);
  return (
    <div className="flex items-center gap-1.5">
      <div className="grid grid-cols-9 gap-1 flex-1">
        {out.map((d, i) => (
          <Dot key={i} dot={d} />
        ))}
      </div>
      <span className="text-faint text-xs select-none" aria-hidden>
        |
      </span>
      <div className="grid grid-cols-9 gap-1 flex-1">
        {back.map((d, i) => (
          <Dot key={i} dot={d} />
        ))}
      </div>
    </div>
  );
}

function Dot({ dot }: { dot: DotData }) {
  const cls = (() => {
    switch (dot.kind) {
      case "eagle":
        return "bg-gold shadow-[0_0_0_1px_rgb(var(--color-gold)/0.4)] text-ink-on-accent";
      case "birdie":
        return "bg-accent text-ink-on-accent";
      case "par":
        return "bg-accent/15 border border-accent/30";
      case "bogey":
        return "bg-danger/55 text-white";
      case "double":
        return "bg-danger shadow-[0_0_0_1.5px_rgb(var(--color-danger)/0.5)] text-white";
      case "current":
        return "border border-dashed border-accent bg-accent/10";
      case "unplayed":
      default:
        return "border border-border";
    }
  })();
  const label = strokesLabel(dot);
  return (
    <span
      className={
        "flex items-center justify-center w-full aspect-square rounded-[3px] font-mono font-semibold text-[8.5px] leading-none " +
        cls
      }
      aria-hidden
    >
      {label}
    </span>
  );
}

// Number drawn inside each played square: the raw stroke count for
// that hole (e.g. 3 / 5 / 7). The color of the square encodes the
// rel-to-par; the number tells you the actual score. Current and
// unplayed have no score yet, so they stay blank.
function strokesLabel(dot: DotData): string {
  if (dot.strokes == null) return "";
  return String(dot.strokes);
}
