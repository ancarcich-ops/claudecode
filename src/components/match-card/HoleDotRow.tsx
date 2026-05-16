// 9 + | + 9 grid of score dots, one per hole. Colors follow the design
// system (chosen explicitly via the spec, intentionally different from
// the standalone /stats chart so green = positive everywhere inside a
// card):
//
//   under par (birdie) -> solid accent (emerald)
//   eagle              -> solid gold + soft glow
//   par                -> mute fill at 32% (neutral disc)
//   bogey              -> danger fill at 70%
//   double or worse    -> solid danger
//   current hole       -> dashed accent border, accent 8% fill
//   unplayed           -> 1px border, transparent fill
//
// For 9-hole rounds we collapse to a single row with no separator.

import type { DotKind } from "@/lib/matchCard";

export default function HoleDotRow({
  dots,
  totalHoles,
}: {
  dots: DotKind[];
  totalHoles: number;
}) {
  if (totalHoles === 9) {
    return (
      <div className="grid grid-cols-9 gap-1">
        {dots.map((d, i) => (
          <Dot key={i} kind={d} />
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
          <Dot key={i} kind={d} />
        ))}
      </div>
      <span className="text-faint text-xs select-none" aria-hidden>
        |
      </span>
      <div className="grid grid-cols-9 gap-1 flex-1">
        {back.map((d, i) => (
          <Dot key={i} kind={d} />
        ))}
      </div>
    </div>
  );
}

function Dot({ kind }: { kind: DotKind }) {
  const cls = (() => {
    switch (kind) {
      case "eagle":
        return "bg-gold shadow-[0_0_0_1px_rgb(var(--color-gold)/0.4)]";
      case "birdie":
        return "bg-accent";
      case "par":
        return "bg-mute/30 border border-mute/30";
      case "bogey":
        return "bg-danger/70";
      case "double":
        return "bg-danger";
      case "current":
        return "border border-dashed border-accent bg-accent/10";
      case "unplayed":
      default:
        return "border border-border";
    }
  })();
  return (
    <span
      className={"block w-full aspect-square rounded-[3px] " + cls}
      aria-hidden
    />
  );
}
