// Horizontal marquee that lives just under the card header. Items
// scroll right-to-left in a single line, 28s linear loop. We duplicate
// the content list once so the loop is seamless when the first copy
// reaches its halfway point.
//
// Edge fading: we apply a horizontal mask so items soft-enter on the
// right edge and soft-exit on the left, rather than popping in/out.

export default function HeaderTicker({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  // Duplicate so the marquee can scroll -50% seamlessly.
  const seq = [...items, ...items];
  return (
    <div
      className="relative -mx-4 sm:-mx-5 h-6 border-y border-border/60 overflow-hidden bg-panel2/60"
      style={{
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
      }}
    >
      <div
        className="scroll-l flex items-center h-full whitespace-nowrap"
        aria-hidden
      >
        {seq.map((item, i) => (
          <span
            key={i}
            className="font-mono text-[10px] uppercase tracking-wider text-mute px-3"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
