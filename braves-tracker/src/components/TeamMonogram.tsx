// A clean monogram avatar — reliable and on-brand (no risk of broken
// remote logo images for lower-level affiliates).

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export default function TeamMonogram({
  name,
  abbreviation,
  isBraves,
  size = 36,
}: {
  name: string;
  abbreviation: string;
  isBraves: boolean;
  size?: number;
}) {
  const label = (abbreviation || name.slice(0, 3)).slice(0, 3).toUpperCase();
  const hue = hashHue(name);

  const style = isBraves
    ? { background: 'linear-gradient(135deg, #CE1141, #8d0b2c)' }
    : { background: `linear-gradient(135deg, hsl(${hue} 35% 32%), hsl(${hue} 40% 20%))` };

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight text-white ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.3, ...style }}
      aria-hidden
    >
      {label}
    </span>
  );
}
