// Tiny wrapper around canvas-confetti. Colors are derived from the instance's
// live accent (the --color-accent / --color-gold CSS vars on <html>) so the
// burst matches whatever palette the user picked, in day or dusk mode.
function cssRgb(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  // Stored as "R G B" triples; turn into "rgb(R,G,B)".
  const parts = raw.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => !Number.isNaN(n))
    ? `rgb(${parts.join(",")})`
    : fallback;
}

export async function celebrate(intensity = 1) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const accent = cssRgb("--color-accent", "rgb(236,123,164)");
  const gold = cssRgb("--color-gold", "rgb(224,169,59)");
  confetti({
    particleCount: Math.round(60 * intensity),
    spread: 70,
    startVelocity: 38,
    origin: { y: 0.7 },
    colors: [accent, gold, "#ffffff"],
    scalar: 0.9,
    ticks: 160,
  });
}
